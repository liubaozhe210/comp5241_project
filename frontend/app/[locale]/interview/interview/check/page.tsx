'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../_components/InterviewProvider';
import { useInterviewToast } from '../../_components/Toast';
import { InlineError, PageHeading } from '../../_components/InterviewUI';
import {
  checkInterviewNetwork,
  clearPendingInterviewDraft,
  createInterview,
  formatMockError,
  readPendingInterviewDraft,
  type InterviewDraft,
} from '@/lib/interview/mock';
import type { AppLocale } from '@/lib/i18n-config';

type Props = { params: { locale: AppLocale } };
type NetworkStatus = 'checking' | 'available' | 'unavailable';
type MicrophoneStatus = 'idle' | 'granted' | 'unavailable' | 'denied';

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

export default function InterviewDeviceCheckPage({ params: { locale } }: Props) {
  const t = useTranslations('interview');
  const router = useRouter();
  const { run } = useInterview();
  const { showToast } = useInterviewToast();
  const [draft, setDraft] = useState<InterviewDraft | null>(null);
  const [draftError, setDraftError] = useState('');
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('checking');
  const [networkError, setNetworkError] = useState('');
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneStatus>('idle');
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [microphoneMeterAvailable, setMicrophoneMeterAvailable] = useState(true);
  const [speakerPlaying, setSpeakerPlaying] = useState(false);
  const [speakerHeard, setSpeakerHeard] = useState(false);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [speakerError, setSpeakerError] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      setDraft(readPendingInterviewDraft());
    } catch (loadError) {
      setDraftError(formatMockError(loadError, locale === 'zh' ? 'zh' : 'en'));
    }
  }, [locale]);

  useEffect(() => {
    void runNetworkCheck();
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    const audioContext = audioContextRef.current;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch((closeError: unknown) => {
        console.error('Unable to close microphone visualizer audio context.', closeError);
      });
    }
    window.speechSynthesis?.cancel();
  }, []);

  async function runNetworkCheck() {
    setNetworkStatus('checking');
    setNetworkError('');
    try {
      await checkInterviewNetwork();
      setNetworkStatus('available');
    } catch (checkError) {
      setNetworkStatus('unavailable');
      setNetworkError(formatMockError(checkError, locale === 'zh' ? 'zh' : 'en'));
    }
  }

  function stopMicrophone() {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch((closeError: unknown) => {
        console.error('Unable to close microphone visualizer audio context.', closeError);
      });
    }
    setMicrophoneLevel(0);
    setMicrophoneStatus('idle');
  }

  async function testMicrophone() {
    stopMicrophone();
    setMicrophoneMeterAvailable(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneStatus('unavailable');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicrophoneStatus('denied');
      return;
    }
    streamRef.current = stream;
    setMicrophoneStatus('granted');
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) {
        setMicrophoneMeterAvailable(false);
        return;
      }
      const audioContext = new AudioContextConstructor();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      const values = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(values);
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        setMicrophoneLevel(average / 255);
        frameRef.current = window.requestAnimationFrame(updateLevel);
      };
      frameRef.current = window.requestAnimationFrame(updateLevel);
    } catch (meterError) {
      setMicrophoneMeterAvailable(false);
      console.error('Unable to start microphone visualization.', meterError);
    }
  }

  function playSpeakerTest() {
    if (typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      setSpeakerError(true);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(t('device.testPhrase'));
    utterance.lang = locale === 'zh' ? 'zh-CN' : 'en-US';
    utterance.onstart = () => setSpeakerPlaying(true);
    utterance.onend = () => {
      setSpeakerPlaying(false);
      setSpeakerTested(true);
    };
    utterance.onerror = () => {
      setSpeakerPlaying(false);
      setSpeakerError(true);
      setSpeakerTested(false);
    };
    try {
      setSpeakerError(false);
      setSpeakerHeard(false);
      setSpeakerTested(false);
      setSpeakerPlaying(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeakerPlaying(false);
      setSpeakerTested(false);
      setSpeakerError(true);
    }
  }

  async function enterInterview() {
    if (!draft || networkStatus !== 'available' || !consent) return;
    setBusy(true);
    setError('');
    try {
      const session = await run(() => createInterview(draft));
      clearPendingInterviewDraft();
      showToast(locale === 'zh' ? '模拟面试已创建。' : 'Mock interview created.', 'success');
      router.push(`/${locale}/interview/interview/${session.id}`);
    } catch (enterError) {
      const message = formatMockError(enterError, locale === 'zh' ? 'zh' : 'en');
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (draftError) return <InlineError>{draftError}</InlineError>;
  if (!draft) {
    return (
      <div className="space-y-5">
        <PageHeading eyebrow={t('device.eyebrow')} title={t('device.title')} />
        <InlineError>{t('device.missingDraft')}</InlineError>
        <Link className="btn" href={`/${locale}/interview/interview/config`}>{t('device.backToConfig')}</Link>
      </div>
    );
  }

  const speechWindow = typeof window === 'undefined' ? null : window as SpeechRecognitionWindow;
  const supportsSpeechRecognition = Boolean(speechWindow?.SpeechRecognition || speechWindow?.webkitSpeechRecognition);
  const supportsSpeechSynthesis = typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('device.eyebrow')}
        title={t('device.title')}
        description={t('device.description')}
        actions={<Link href={`/${locale}/interview/interview/config`} className="btn-ghost">{t('backHome')}</Link>}
      />

      <section className="card space-y-5 p-5 sm:p-7">
        <div className="rounded-xl border border-black/10 p-4" role="status">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{t('device.network')}</p>
            <span className={`badge ${networkStatus === 'available' ? 'badge-ok' : networkStatus === 'unavailable' ? 'badge-err' : 'badge-grey'}`}>
              {networkStatus === 'checking'
                ? t('device.checking')
                : networkStatus === 'available'
                  ? t('device.connected')
                  : t('device.failed')}
            </span>
          </div>
          {networkError ? <p className="mt-2 text-sm text-red-800">{networkError}</p> : null}
          <button type="button" className="btn-ghost mt-3 px-3 py-1.5 text-xs" disabled={networkStatus === 'checking'} onClick={() => void runNetworkCheck()}>
            {t('device.checkAgain')}
          </button>
        </div>

        <div className="rounded-xl border border-amber-700/20 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{t('device.speaker')}</p>
              <p className="mt-1 text-xs leading-5 text-ink-700">{t('device.speakerHelp')}</p>
            </div>
            <button type="button" className="btn-ghost" disabled={speakerPlaying} onClick={playSpeakerTest}>
              {speakerPlaying ? t('device.playing') : t('device.playSound')}
            </button>
          </div>
          {speakerError || !supportsSpeechSynthesis ? <p className="mt-2 text-xs text-amber-900">{t('device.speakerWarning')}</p> : null}
          {speakerHeard ? <p className="mt-2 text-xs text-amber-900">{t('device.speakerConfirmed')}</p> : null}
          <button type="button" className="btn-ghost mt-2 px-3 py-1.5 text-xs" disabled={speakerPlaying || !speakerTested} onClick={() => setSpeakerHeard(true)}>
            {t('device.iHeardIt')}
          </button>
        </div>

        <div className="rounded-xl border border-amber-700/20 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{t('device.microphone')}</p>
              <p className="mt-1 text-xs leading-5 text-ink-700">{t('device.microphoneHelp')}</p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => void testMicrophone()}>
              {microphoneStatus === 'granted' ? t('device.microphoneGranted') : t('device.testMicrophone')}
            </button>
          </div>
          {microphoneStatus === 'granted' ? (
            <div className="mt-3" role="img" aria-label={t('device.microphoneMeter')}>
              <div className="h-2 overflow-hidden rounded-full bg-amber-200">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(3, microphoneLevel * 100)}%` }} />
              </div>
            </div>
          ) : null}
          {microphoneStatus === 'denied' || microphoneStatus === 'unavailable' ? (
            <p className="mt-2 text-xs text-amber-900">{t('device.microphoneWarning')}</p>
          ) : null}
          {microphoneStatus === 'granted' && !microphoneMeterAvailable ? <p className="mt-2 text-xs text-amber-900">{t('device.microphoneMeterWarning')}</p> : null}
          {!supportsSpeechRecognition ? <p className="mt-2 text-xs text-amber-900">{t('device.voiceApiWarning')}</p> : null}
        </div>

        <div className="rounded-xl border border-accent/15 bg-accent-soft/50 p-4">
          <p className="text-sm font-semibold">{t('config.privacy')}</p>
          {draft.resumeId ? <p className="mt-2 text-xs leading-5 text-ink-700">{t('resume.privacyBody')}</p> : null}
          <label className="mt-3 flex items-start gap-2 text-xs leading-5">
            <input type="checkbox" className="mt-1 accent-accent" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>{t('config.consent')}</span>
          </label>
        </div>

        {error ? <InlineError>{error}</InlineError> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">{t('device.optionalWarning')}</p>
          <button
            type="button"
            className="btn"
            disabled={networkStatus !== 'available' || !consent || busy}
            onClick={() => void enterInterview()}
          >
            {busy ? t('working') : t('device.enterRoom')}
          </button>
        </div>
      </section>
    </div>
  );
}
