'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
  ScoreBadge,
  Tabs,
} from '../../_components/InterviewUI';
import {
  createAssessment,
  createResume,
  deleteAssessment,
  formatMockError,
} from '@/lib/interview/mock';
import type { InterviewLocale, ResumeAssessment, ResumeLevel } from '@/lib/interview/types';

type Props = {
  params: { locale: InterviewLocale };
  searchParams: { assessmentId?: string };
};
type InputMode = 'paste' | 'upload';

const SAMPLE_RESUME_EN =
  'Alex Chen\nFrontend Engineer | React, TypeScript, accessibility\n\nEDUCATION\nBSc Computer Science, City University, 2022–2026\n\nPROJECT EXPERIENCE\nCampus Events Dashboard | React, TypeScript, Node.js\nBuilt a responsive event dashboard used by student societies. Reworked the search and filtering flow, added keyboard navigation, and wrote reusable components with documented props. Worked with three teammates using weekly reviews and issue tracking. Reduced repeated UI code and improved the consistency of event pages.\n\nEXPERIENCE\nWeb Development Intern | Northstar Studio | Summer 2025\nImplemented landing-page components, fixed responsive layout defects, and reviewed pull requests with a mentor.\n\nSKILLS\nReact, TypeScript, JavaScript, HTML, CSS, Git, REST APIs, unit testing';

const SAMPLE_RESUME_ZH =
  '陈 Alex\n前端工程师 | React、TypeScript、无障碍设计\n\n教育经历\n城市大学 计算机科学学士，2022–2026\n\n项目经历\n校园活动看板 | React、TypeScript、Node.js\n为学生社团开发响应式活动看板，改进搜索与筛选流程，增加键盘导航，并编写带有 props 说明的可复用组件。与三名队友通过每周评审和问题跟踪协作，减少重复 UI 代码并提升活动页面的一致性。\n\n工作经历\nNorthstar Studio 网页开发实习生 | 2025 年夏\n实现落地页组件、修复响应式布局问题，并与导师共同审查代码。\n\n技能\nReact、TypeScript、JavaScript、HTML、CSS、Git、REST API、单元测试';

const dimensionKeys = ['job_match', 'quantification', 'project_impact', 'structure', 'language'] as const;

export default function ResumeAssessmentPage({ params: { locale }, searchParams }: Props) {
  const t = useTranslations('interview');
  const { data, loading, loadError, refresh, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [mode, setMode] = useState<InputMode>('paste');
  const [title, setTitle] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [seniority, setSeniority] = useState<ResumeLevel>('junior');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(searchParams.assessmentId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedAssessment = useMemo(
    () => data?.assessments.find((assessment) => assessment.id === selectedAssessmentId) ?? data?.assessments[0] ?? null,
    [data, selectedAssessmentId],
  );
  const selectedResume = data?.resumes.find((resume) => resume.id === selectedResumeId) ?? null;

  useEffect(() => {
    if (!data) return;
    if (!selectedResumeId && data.resumes[0]) setSelectedResumeId(data.resumes[0].id);
    if (selectedAssessmentId && !data.assessments.some((assessment) => assessment.id === selectedAssessmentId)) {
      setSelectedAssessmentId('');
    }
  }, [data, selectedResumeId, selectedAssessmentId]);

  function onFileChange(nextFile: File | null) {
    setError('');
    setFile(nextFile);
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

  async function simulateExtraction() {
    if (!file) return;
    setExtracting(true);
    setError('');
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    setResumeText(locale === 'zh' ? SAMPLE_RESUME_ZH : SAMPLE_RESUME_EN);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    setExtracting(false);
    showToast(locale === 'zh' ? '已模拟提取文本；原文件没有上传。' : 'Text extraction was simulated; the file was not uploaded.', 'success');
  }

  async function submitAssessment() {
    setError('');
    if (!consent) {
      setError(locale === 'zh' ? '请先确认本地模拟说明。' : 'Confirm the local mock notice first.');
      return;
    }
    setBusy(true);
    try {
      let resumeId = selectedResumeId;
      if (!resumeId) {
        const resume = await run(() =>
          createResume({
            title,
            text: resumeText,
            sourceFilename: file?.name ?? null,
            sourceMime: file?.type || (file?.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : null),
            sourceSizeBytes: file?.size ?? null,
            jobTitle,
            seniority,
            jobDescription,
          }),
        );
        resumeId = resume.id;
        setSelectedResumeId(resume.id);
        showToast(t('resume.resumeSaved'), 'success');
      }
      const report = await run(() => createAssessment(resumeId, jobTitle || selectedResume?.jobTitle || '', locale));
      setSelectedAssessmentId(report.id);
      setConsent(false);
      showToast(t('resume.assessmentSuccess'), 'success');
    } catch (actionError) {
      setError(formatMockError(actionError, locale));
      showToast(formatMockError(actionError, locale), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeAssessment(assessment: ResumeAssessment) {
    try {
      await run(() => deleteAssessment(assessment.id));
      setSelectedAssessmentId('');
      showToast(locale === 'zh' ? '评估报告已删除。' : 'Assessment report deleted.', 'success');
    } catch (actionError) {
      setError(formatMockError(actionError, locale));
      throw actionError;
    }
  }

  function exportText(assessment: ResumeAssessment) {
    const lines = [
      `Interview Mastery — ${t('resume.report')}`,
      `${t('resume.targetRole')}: ${assessment.jobTitle}`,
      `${t('resume.score')}: ${assessment.overallScore}/100`,
      '',
      ...dimensionKeys.map((key) => `${t(`resume.${key === 'job_match' ? 'jobMatch' : key === 'project_impact' ? 'projectImpact' : key}`)}: ${assessment.dimensions[key].score}/100 — ${assessment.dimensions[key].summary}`),
      '',
      t('resume.recommendations'),
      ...assessment.recommendations.map((item) => `- ${item.issue}\n  ${item.rewriteExample}\n  ${item.reason}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `resume-assessment-${assessment.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{t('errors.MOCK_DATA_INVALID')}</InlineError>;

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
                    <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={extracting} onClick={() => void simulateExtraction()}>
                      {extracting ? t('working') : t('resume.parseFile')}
                    </button>
                  </div>
                ) : null}
                {resumeText ? (
                  <label className="mt-4 block">
                    <span className="label">{t('resume.extractedText')}</span>
                    <textarea className="input mt-2 min-h-56 resize-y" value={resumeText} onChange={(event) => setResumeText(event.target.value)} maxLength={30000} />
                  </label>
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
            <h2 className="text-lg font-semibold">{t('resume.savedResumes')}</h2>
            {!data.resumes.length ? (
              <div className="mt-4">
                <EmptyState title={t('resume.noResumes')} body={t('resume.noResumesBody')} />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {data.resumes.map((resume) => (
                  <button
                    type="button"
                    key={resume.id}
                    onClick={() => {
                      setSelectedResumeId(resume.id);
                      setResumeText(resume.text);
                      setTitle(resume.title);
                      setJobTitle(resume.jobTitle);
                      setJobDescription(resume.jobDescription);
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition ${selectedResumeId === resume.id ? 'border-accent bg-accent-soft/60' : 'border-black/10 bg-ivory-50 hover:border-accent/30'}`}
                  >
                    <span className="block text-sm font-semibold">{resume.title}</span>
                    <span className="mt-1 block text-xs text-ink-500">{resume.jobTitle || t('resume.unspecified')} · {formatDate(resume.updatedAt, locale)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t('resume.report')}</h2>
              {selectedAssessment ? <ScoreBadge score={selectedAssessment.overallScore} /> : null}
            </div>
            {!selectedAssessment ? (
              <div className="mt-4"><EmptyState title={t('resume.history')} body={t('resume.emptyReport')} /></div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{selectedAssessment.jobTitle || t('resume.unspecified')}</p>
                    <p className="mt-1 text-xs text-ink-500">{formatDate(selectedAssessment.createdAt, locale)}</p>
                  </div>
                  <span className="badge badge-warn">{t(`resume.${selectedAssessment.rating === 'qualified' ? 'qualified' : selectedAssessment.rating === 'weak' ? 'weak' : 'needsImprovement'}`)}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {dimensionKeys.map((key) => {
                    const labelKey = key === 'job_match' ? 'jobMatch' : key === 'project_impact' ? 'projectImpact' : key;
                    const dimension = selectedAssessment.dimensions[key];
                    return (
                      <div key={key} className="rounded-lg bg-ivory-100 p-3">
                        <div className="flex justify-between gap-2 text-xs font-semibold">
                          <span>{t(`resume.${labelKey}`)}</span><span>{dimension.score}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-ink-500">{dimension.summary}</p>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <h3 className="label">{t('resume.recommendations')}</h3>
                  <div className="mt-2 space-y-3">
                    {selectedAssessment.recommendations.map((item, index) => (
                      <article key={`${item.section}-${index}`} className="rounded-xl border border-black/10 p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="text-sm font-semibold">{item.section}</p>
                          <span className={`badge ${item.priority === 'high' ? 'badge-err' : item.priority === 'medium' ? 'badge-warn' : 'badge-grey'}`}>
                            {t(`resume.priority${item.priority[0].toUpperCase()}${item.priority.slice(1)}`)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-ink-700"><b>{t('resume.issue')}:</b> {item.issue}</p>
                        <p className="mt-2 rounded-lg bg-ivory-100 p-2 text-xs leading-5"><b>{t('resume.rewrite')}:</b> {item.rewriteExample}</p>
                        <p className="mt-2 text-xs leading-5 text-ink-500"><b>{t('resume.reason')}:</b> {item.reason}</p>
                      </article>
                    ))}
                  </div>
                </div>
                {selectedAssessment.riskFlags.length ? (
                  <div className="rounded-xl border border-amber-700/20 bg-amber-50 p-3">
                    <h3 className="text-sm font-semibold">{t('resume.riskFlags')}</h3>
                    {selectedAssessment.riskFlags.map((risk, index) => (
                      <p className="mt-2 text-xs leading-5" key={`${risk.category}-${index}`}><b>{risk.category}:</b> {risk.suggestion}</p>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => exportText(selectedAssessment)}>{t('resume.exportText')}</button>
                  <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => window.print()}>{t('resume.printPdf')}</button>
                  <ConfirmButton
                    danger
                    title={t('resume.deleteAssessment')}
                    message={locale === 'zh' ? '删除后无法恢复。' : 'This report cannot be recovered after deletion.'}
                    confirmLabel={t('resume.deleteAssessment')}
                    cancelLabel={t('cancel')}
                    failureLabel={t('errors.UNKNOWN')}
                    onConfirm={() => removeAssessment(selectedAssessment)}
                  />
                </div>
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-semibold">{t('resume.history')}</h2>
            <div className="mt-3 space-y-2">
              {data.assessments.map((assessment) => (
                <button
                  type="button"
                  key={assessment.id}
                  onClick={() => setSelectedAssessmentId(assessment.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-xs ${selectedAssessment?.id === assessment.id ? 'border-accent bg-accent-soft/50' : 'border-black/10 hover:border-accent/30'}`}
                >
                  <span>{assessment.jobTitle || t('resume.unspecified')} · {formatDate(assessment.createdAt, locale)}</span>
                  <ScoreBadge score={assessment.overallScore} />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
