# PDF to interactive course: frontend demonstration

This feature extends the existing CourseHub HTML / CSS / JavaScript prototype. It runs by opening a local HTML file and requires no build, package installation, account service or network connection.

## Try it

1. Open [the teacher shortcut](../demo/pdf-course-demo.html). It selects the Michael Wong demo identity and Chinese interface once. Alternatively, use [the standard entry](../demo/index.html), sign in as a teacher and open **PDF course studio**.
2. Choose a PDF, or select **Use sample material**. Actual files are checked for a `%PDF-` header and size no greater than 20 MB. They stay on the device.
3. Choose a parent course, example topic, learner level and course language. Optionally enter a title and teaching goal. Select knowledge checks, a scenario, or both.
4. Generate the draft. Three brief local generation stages lead to an editable overview and three lessons.
5. Review lesson titles, explanations, worked examples, questions, options, correct answers and explanations. The final scenario also has editable instructions, an example answer, checklist labels and comma-separated matching keywords.
6. Save a draft or preview it as a learner. Preview progress is isolated from student records.
7. Publish into a published parent course. Draft parent courses may hold an interactive draft, but must be published before their interactive content can be published. Archived courses cannot be edited.
8. Sign out and use the example student **Lin Mohan**, email `26072062g@connect.polyu.hk`, password `demo1234`. This student is already approved in COMP5241.
9. Open COMP5241 and its **Interactive learning** section. Answer each knowledge check correctly, review the final scenario response and complete the lessons. Refreshing retains checked answers and completed progress in the same browser.

## What is simulated

- PDF text is **not extracted or summarised**. The source filename is metadata, not evidence that its pages were analysed.
- Course content uses curated English / Chinese examples for requirements engineering, AI coding agents and software testing. Selecting a different topic changes the content; selecting intermediate level adds an extension task.
- The interface language and generated content language are separate. Changing the interface language does not translate a saved course or student response.
- Scenario feedback checks explicit, teacher-editable keywords. It is a practice checklist, not factual marking or AI evaluation. A response must contain at least 30 non-space characters before feedback is shown.
- The selected PDF can be opened through a temporary browser URL. The PDF bytes are not saved; after refresh, only its name and size remain.
- No external AI, analytics or file upload endpoint is used.

## Workflow and storage

The optional `interactiveCourses` and `interactiveProgress` collections extend the existing mock database. Existing saved databases remain compatible without a reset.

An interactive course stores its owner, parent course, source metadata, editable `content`, separate `publishedContent`, publication state and revision. Saving changes preserves the previous published snapshot. Publishing changed content increments the revision; publishing unchanged content does not. Each published revision has an independent student progress record.

Progress is keyed by user, interactive-course ID and revision. It records completed lessons, checked multiple-choice answers, scenario responses and checklist results. Teacher preview is kept in memory and never creates a student record. Unsaved scenario response drafts stay in memory until checked; only checked work and completion are durably saved.

Students must be approved members of the parent course. They cannot open an interactive draft, another course's restricted content or the teacher editor by changing the URL. Teachers can edit only their own non-archived courses. Administrators may inspect content using the existing preview access.

All persistence is local to the browser and file / origin. It is neither shared between computers nor a substitute for server-side authorization. Resetting demo data clears the new collections as well. The pre-existing authentication, interview and file-management demo limitations remain outside this feature's scope.

## Implementation map

- [pdf-course.js](../demo/pdf-course.js): workflow, file validation, editor, publication, access checks and learner activities.
- [pdf-course-content.js](../demo/pdf-course-content.js): curated bilingual topic content.
- [pdf-course-i18n.js](../demo/pdf-course-i18n.js): bilingual interface copy, extending the existing dictionary.
- [pdf-course.css](../demo/pdf-course.css): scoped interface styles using the existing ivory and ink-blue palette.
- [app.js](../demo/app.js): routes, teacher navigation, course-page entry and event delegation hooks.

## Verification

Run from the repository root:

```sh
node demo/smoke-test.mjs
node demo/pdf-course-test.mjs
node demo/check-i18n.mjs
node scripts/check-docs.mjs
```

The dedicated feature tests cover file signature / size / read failures, topic and activity choices, editable content, publication snapshots, enrollment and ownership boundaries, teacher-preview isolation, quiz retries, scenario feedback, student isolation, persistence, versioned progress, text escaping, storage quota failure, generation cancellation and the one-time shortcut identity.

Automated browser launch was unavailable in the authoring environment because the installed browser exited during startup. Pixel layout, native file-picker interactions and end-to-end browser behavior therefore remain unverified. The behavioural tests run in a simulated DOM; they do not establish visual correctness.
