'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../_components/InterviewProvider';
import { useInterviewToast } from '../../_components/Toast';
import {
  ConfirmButton,
  EmptyState,
  formatDate,
  InlineError,
  LoadingState,
  PageHeading,
  Tabs,
} from '../../_components/InterviewUI';
import { createAssessment, createResume, deleteResume, getResume, parseResumeFile, updateResume } from '@/lib/interview/api';
import { formatInterviewError } from '@/lib/interview/utils';
import type { InterviewLocale, ResumeLevel } from '@/lib/interview/types';

type Props = { params: { locale: InterviewLocale } };
type InputMode = 'paste' | 'upload';

export default function ResumeAssessmentPage({ params: { locale } }: Props) {
  const t = useTranslations('interview');
  const router = useRouter();
  const { data, loading, loadError, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [mode, setMode] = useState<InputMode>('paste');
  const [title, setTitle] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [seniority, setSeniority] = useState<ResumeLevel>('junior');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsedFile, setParsedFile] = useState<{
    sourceFilename: string | null;
    sourceMime: string | null;
    sourceSizeBytes: number | null;
    ocrUsed: boolean;
  } | null>(null);
  const [loadedResumeId, setLoadedResumeId] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [ocrConsent, setOcrConsent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedResume = data?.resumes.find((resume) => resume.id === selectedResumeId) ?? null;

  useEffect(() => {
    if (!selectedResumeId || loadedResumeId === selectedResumeId) return;
    let active = true;
    void getResume(selectedResumeId).then((resume) => {
      if (!active) return;
      setTitle(resume.title);
      setJobTitle(resume.jobTitle);
      setSeniority(resume.seniority);
      setJobDescription(resume.jobDescription);
      setResumeText(resume.text);
      setParsedFile({
        sourceFilename: resume.sourceFilename,
        sourceMime: resume.sourceMime,
        sourceSizeBytes: resume.sourceSizeBytes,
        ocrUsed: false,
      });
      setLoadedResumeId(resume.id);
    }).catch((loadError: unknown) => {
      if (active) setError(formatInterviewError(loadError, locale));
    });
    return () => { active = false; };
  }, [selectedResumeId, loadedResumeId, locale]);

  function startNewResume() {
    setSelectedResumeId('');
    setLoadedResumeId('');
    setTitle('');
    setJobTitle('');
    setSeniority('junior');
    setJobDescription('');
    setResumeText('');
    setFile(null);
    setParsedFile(null);
    setOcrConsent(false);
    setError('');
  }

  function onFileChange(nextFile: File | null) {
    setError('');
    setSelectedResumeId('');
    setLoadedResumeId('');
    setFile(nextFile);
    setParsedFile(null);
    setOcrConsent(false);
    setResumeText('');
    if (!nextFile) return;
    const extension = nextFile.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx'].includes(extension ?? '')) {
      setFile(null);
      setError(locale === 'zh' ? '只支持 PDF 或 DOCX 文件。' : 'Only PDF or DOCX files are supported.');
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      setError(locale === 'zh' ? '文件不能超过 10 MiB。' : 'The file must not exceed 10 MiB.');
    }
  }

  async function extractFile() {
    if (!file) return;
    setExtracting(true);
    setError('');
    try {
      const parsed = await parseResumeFile(file, ocrConsent);
      setResumeText(parsed.text);
      setParsedFile(parsed);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      showToast(parsed.ocrUsed ? t('resume.ocrUsed') : t('resume.fileParsed'), 'success');
    } catch (parseError) {
      const message = formatInterviewError(parseError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setExtracting(false);
    }
  }

  async function submitAssessment() {
    setError('');
    if (!consent) {
      setError(t('resume.consentRequired'));
      return;
    }
    setBusy(true);
    try {
      const input = {
        title,
        text: resumeText,
        sourceFilename: parsedFile?.sourceFilename ?? file?.name ?? null,
        sourceMime: parsedFile?.sourceMime ?? null,
        sourceSizeBytes: parsedFile?.sourceSizeBytes ?? null,
        jobTitle,
        seniority,
        jobDescription,
      };
      const resume = selectedResumeId
        ? await run(() => updateResume(selectedResumeId, input))
        : await run(() => createResume(input));
      const resumeId = resume.id;
      setSelectedResumeId(resumeId);
      setLoadedResumeId(resumeId);
      const report = await run(() => createAssessment(resumeId, jobTitle || resume.jobTitle, locale));
      setConsent(false);
      showToast(t('resume.assessmentSuccess'), 'success');
      router.push(`/${locale}/interview/resume/assessment/${report.id}`);
    } catch (actionError) {
      setError(formatInterviewError(actionError, locale));
      showToast(formatInterviewError(actionError, locale), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeResume(resumeId: string) {
    try {
      await run(() => deleteResume(resumeId));
      if (selectedResumeId === resumeId) {
        setSelectedResumeId('');
        setResumeText('');
        setTitle('');
        setJobTitle('');
        setJobDescription('');
      }
      showToast(t('resume.resumeDeleted'), 'success');
    } catch (actionError) {
      const message = formatInterviewError(actionError, locale);
      setError(message);
      showToast(message, 'error');
      throw actionError;
    }
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{formatInterviewError(new Error(loadError), locale)}</InlineError>;

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('resume.eyebrow')}
        title={t('resume.assessmentTitle')}
        description={t('resume.assessmentDescription')}
        actions={<Link href={`/${locale}/interview`} className="btn-ghost">{t('backHome')}</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <section className="card p-5 sm:p-6">
          <Tabs
            value={mode}
            onChange={(value) => setMode(value as InputMode)}
            items={[
              { value: 'paste', label: t('resume.pasteTab') },
              { value: 'upload', label: t('resume.uploadTab') },
            ]}
          />

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="label">{t('resume.resumeTitle')}</span>
              <input className="input mt-2" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('resume.resumeTitlePlaceholder')} maxLength={80} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">{t('resume.targetRole')}</span>
                <input className="input mt-2" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder={t('resume.targetRolePlaceholder')} maxLength={120} />
              </label>
              <label className="block">
                <span className="label">{t('resume.seniority')}</span>
                <select className="input mt-2" value={seniority} onChange={(event) => setSeniority(event.target.value as ResumeLevel)}>
                  {(['intern', 'junior', 'mid', 'senior', 'unspecified'] as ResumeLevel[]).map((level) => (
                    <option key={level} value={level}>{t(`levels.${level}`)}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="label">{t('resume.jobDescription')}</span>
              <textarea className="input mt-2 min-h-24 resize-y" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder={t('resume.jobDescriptionPlaceholder')} maxLength={5000} />
            </label>

            {mode === 'paste' ? (
              <label className="block">
                <span className="label">{t('resume.resumeText')}</span>
                <textarea className="input mt-2 min-h-64 resize-y" value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder={t('resume.resumeTextPlaceholder')} maxLength={30000} />
                <span className="mt-1 block text-right text-[11px] text-ink-500">{resumeText.length.toLocaleString()} / 30,000</span>
              </label>
            ) : (
              <div className="rounded-xl border border-dashed border-black/20 bg-ivory-100 p-4">
                <label className="block">
                  <span className="label">{t('resume.chooseFile')}</span>
                  <input className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
                </label>
                <p className="mt-2 text-xs text-ink-500">{t('resume.fileLimit')}</p>
                {file ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ivory-50 p-3 text-xs">
                    <span>{t('resume.fileSelected', { name: file.name })}</span>
                    <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={extracting} onClick={() => void extractFile()}>
                      {extracting ? t('working') : t('resume.parseFile')}
                    </button>
                  </div>
                ) : null}
                {file?.name.toLowerCase().endsWith('.pdf') ? (
                  <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-900/15 bg-amber-50/60 p-3 text-xs leading-5">
                    <input
                      type="checkbox"
                      className="mt-1 accent-accent"
                      checked={ocrConsent}
                      onChange={(event) => setOcrConsent(event.target.checked)}
                    />
                    <span>{t('resume.ocrConsent')}</span>
                  </label>
                ) : null}
                {resumeText ? (
                  <label className="mt-4 block">
                    <span className="label">{t('resume.extractedText')}</span>
                    <textarea className="input mt-2 min-h-56 resize-y" value={resumeText} onChange={(event) => setResumeText(event.target.value)} maxLength={30000} />
                  </label>
                ) : null}
                {parsedFile?.ocrUsed ? (
                  <p role="status" className="mt-2 text-xs text-amber-900">{t('resume.ocrUsed')}</p>
                ) : null}
              </div>
            )}

            <div className="rounded-xl border border-accent/15 bg-accent-soft/50 p-4">
              <p className="text-sm font-semibold">{t('resume.privacyTitle')}</p>
              <p className="mt-1 text-xs leading-5 text-ink-700">{t('resume.privacyBody')}</p>
              <label className="mt-3 flex items-start gap-2 text-xs leading-5">
                <input type="checkbox" className="mt-1 accent-accent" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{t('resume.consent')}</span>
              </label>
            </div>
            {error ? <InlineError>{error}</InlineError> : null}
            <button type="button" className="btn w-full sm:w-auto" disabled={busy || (mode === 'upload' && !resumeText)} onClick={() => void submitAssessment()}>
              {busy ? t('working') : selectedResumeId ? t('resume.assessSaved') : t('resume.saveAndAssess')}
            </button>
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t('resume.savedResumes')}</h2>
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={startNewResume}>{t('resume.newResume')}</button>
            </div>
            {!data.resumes.length ? (
              <div className="mt-4">
                <EmptyState title={t('resume.noResumes')} body={t('resume.noResumesBody')} />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {data.resumes.map((resume) => {
                  const linkedSessions = data.sessions.filter((session) => session.resumeId === resume.id).length;
                  return (
                    <div className={`rounded-xl border p-3 transition ${selectedResumeId === resume.id ? 'border-accent bg-accent-soft/60' : 'border-black/10 bg-ivory-50'}`} key={resume.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setSelectedResumeId(resume.id);
                          setLoadedResumeId('');
                        }}
                        className="w-full text-left"
                      >
                        <span className="block text-sm font-semibold">{resume.title}</span>
                        <span className="mt-1 block text-xs text-ink-500">{resume.jobTitle || t('resume.unspecified')} · {formatDate(resume.updatedAt, locale)}</span>
                      </button>
                      {linkedSessions ? <p className="mt-2 text-xs text-amber-900">{t('resume.linkedInterviewWarning')}</p> : null}
                      <ConfirmButton
                        danger
                        title={t('resume.deleteTitle')}
                        message={linkedSessions ? t('resume.deleteLinkedBody') : t('resume.deleteBody')}
                        confirmLabel={t('resume.delete')}
                        cancelLabel={t('cancel')}
                        failureLabel={t('errors.UNKNOWN')}
                        onConfirm={() => removeResume(resume.id)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-semibold">{t('resume.history')}</h2>
            {data.assessments.length ? (
              <div className="mt-3 space-y-2">
                {data.assessments.map((assessment) => (
                  <Link
                    href={`/${locale}/interview/resume/assessment/${assessment.id}`}
                    key={assessment.id}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-black/10 p-3 text-left text-xs hover:border-accent/30"
                  >
                    <span>{assessment.jobTitle || t('resume.unspecified')} · {formatDate(assessment.createdAt, locale)}</span>
                    <span className="font-semibold text-accent">{t('resume.viewReport')} →</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4"><EmptyState title={t('resume.history')} body={t('resume.emptyReport')} /></div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
