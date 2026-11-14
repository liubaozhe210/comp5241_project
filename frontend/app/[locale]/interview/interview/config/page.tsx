'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../_components/InterviewProvider';
import { useInterviewToast } from '../../_components/Toast';
import { InlineError, LoadingState, PageHeading } from '../../_components/InterviewUI';
import { formatMockError, labelForLevel, savePendingInterviewDraft } from '@/lib/interview/mock';
import type { InterviewLocale, InterviewType, ResumeLevel } from '@/lib/interview/types';

type Props = { params: { locale: InterviewLocale } };

export default function InterviewConfigPage({ params: { locale } }: Props) {
  const t = useTranslations('interview');
  const router = useRouter();
  const { data, loading, loadError } = useInterview();
  const { showToast } = useInterviewToast();
  const [jobTitle, setJobTitle] = useState('');
  const [seniority, setSeniority] = useState<ResumeLevel>('junior');
  const [interviewType, setInterviewType] = useState<InterviewType>('mixed');
  const [questionLimit, setQuestionLimit] = useState(8);
  const [resumeId, setResumeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setError('');
    if (!jobTitle.trim()) {
      setError(t('config.validation'));
      return;
    }
    setBusy(true);
    try {
      savePendingInterviewDraft({
        jobTitle: jobTitle.trim(),
        seniority,
        interviewType,
        questionLimit,
        resumeId: resumeId || null,
        locale,
      });
      router.push(`/${locale}/interview/interview/check`);
    } catch (actionError) {
      const message = formatMockError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{t('errors.MOCK_DATA_INVALID')}</InlineError>;

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('config.eyebrow')}
        title={t('config.title')}
        description={t('config.description')}
        actions={<Link href={`/${locale}/interview`} className="btn-ghost">{t('backHome')}</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
        <section className="card p-5 sm:p-7">
          <div className="space-y-5">
            <label className="block">
              <span className="label">{t('config.jobTitle')}</span>
              <input className="input mt-2" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder={t('config.jobTitlePlaceholder')} maxLength={120} />
              <span className="mt-1 block text-right text-[11px] text-ink-500">{jobTitle.length} / 120</span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">{t('config.seniority')}</span>
                <select className="input mt-2" value={seniority} onChange={(event) => setSeniority(event.target.value as ResumeLevel)}>
                  {(['intern', 'junior', 'mid', 'senior'] as ResumeLevel[]).map((level) => <option value={level} key={level}>{labelForLevel(level, locale)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">{t('config.interviewType')}</span>
                <select className="input mt-2" value={interviewType} onChange={(event) => setInterviewType(event.target.value as InterviewType)}>
                  <option value="mixed">{t('config.mixed')}</option>
                  <option value="technical">{t('config.technicalOnly')}</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="flex items-center justify-between gap-3">
                <span className="label">{t('config.questionLimit')}</span>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">{questionLimit}</span>
              </span>
              <input className="mt-4 w-full accent-accent" type="range" min={4} max={12} step={1} value={questionLimit} onChange={(event) => setQuestionLimit(Number(event.target.value))} />
              <span className="mt-1 block text-xs text-ink-500">{t('config.questionRange')}</span>
            </label>

            <label className="block">
              <span className="label">{t('config.resume')}</span>
              <select className="input mt-2" value={resumeId} onChange={(event) => setResumeId(event.target.value)}>
                <option value="">{t('config.noResume')}</option>
                {data.resumes.map((resume) => <option value={resume.id} key={resume.id}>{resume.title}</option>)}
              </select>
              {!data.resumes.length ? (
                <Link className="mt-2 inline-block text-xs font-semibold text-accent underline" href={`/${locale}/interview/resume/assessment`}>
                  {t('resume.noResumesBody')}
                </Link>
              ) : null}
            </label>

            {error ? <InlineError>{error}</InlineError> : null}
            <button type="button" className="btn w-full sm:w-auto" disabled={busy} onClick={() => void start()}>
              {busy ? t('working') : t('config.start')}
            </button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="label">{t('conversation.guideTab')}</p>
            <h2 className="mt-2 font-serif text-xl font-semibold">{jobTitle || t('config.jobTitlePlaceholder')}</h2>
            <div className="mt-4 space-y-3 text-sm text-ink-700">
              <div className="flex justify-between gap-3"><span>{t('config.seniority')}</span><b>{labelForLevel(seniority, locale)}</b></div>
              <div className="flex justify-between gap-3"><span>{t('config.interviewType')}</span><b>{interviewType === 'mixed' ? t('config.mixed') : t('config.technicalOnly')}</b></div>
              <div className="flex justify-between gap-3"><span>{t('config.questionLimit')}</span><b>{questionLimit}</b></div>
              <div className="flex justify-between gap-3"><span>{t('config.resume')}</span><b className="max-w-[60%] truncate">{data.resumes.find((item) => item.id === resumeId)?.title ?? t('config.noResume')}</b></div>
            </div>
          </div>
          <div className="rounded-2xl border border-black/10 bg-ivory-100 p-5">
            <h2 className="text-sm font-semibold">{t('conversation.guideTab')}</h2>
            <p className="mt-2 text-xs leading-5 text-ink-700">{t('conversation.guideBody')}</p>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-xs text-ink-500">
              <li>{t('conversation.phase')}: {locale === 'zh' ? '自我介绍 → 基础考察 → 经历深挖 → 面试复盘' : 'Introduction → fundamentals → deep dive → review'}</li>
              <li>{t('device.title')} → {t('device.enterRoom')}</li>
              <li>{t('conversation.finish')}</li>
              <li>{t('report.title')}</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
