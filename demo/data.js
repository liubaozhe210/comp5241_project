/* 演示用模拟数据。没有后端，所有数据存在浏览器 localStorage 里，可一键重置。 */
const MOCK = (function () {
  const KEY = 'coursehub.demo.db';
  const DB_VERSION = 1;
  let memory = null;

  function iso(daysAgo, hour) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour === undefined ? 10 : hour, 0, 0, 0);
    return d.toISOString();
  }

  function seed() {
    return {
      version: DB_VERSION,
      seq: 100,
      users: [
        { id: 'u_admin', loginId: 'admin', name: 'Alice Chan', email: 'admin@polyu.edu.hk', role: 'admin', status: 'active' },
        { id: 'u_t1', loginId: 't1001', name: 'Dr. Michael Wong', email: 'michael.wong@polyu.edu.hk', role: 'teacher', status: 'active' },
        { id: 'u_t2', loginId: 't1002', name: 'Prof. Sarah Lee', email: 'sarah.lee@polyu.edu.hk', role: 'teacher', status: 'active' },
        { id: 'u_s1', loginId: '26072062g', name: 'Lin Mohan', email: '26072062g@connect.polyu.hk', role: 'student', status: 'active' },
        { id: 'u_s2', loginId: '26072063g', name: 'Chen Wei', email: '26072063g@connect.polyu.hk', role: 'student', status: 'active' },
        { id: 'u_s3', loginId: '26072064g', name: 'Priya Nair', email: '26072064g@connect.polyu.hk', role: 'student', status: 'active' },
        { id: 'u_s4', loginId: '26072065g', name: 'Kenji Sato', email: '26072065g@connect.polyu.hk', role: 'student', status: 'disabled' },
      ],
      courses: [
        {
          id: 'c1', code: 'COMP5241', name: 'Software Engineering', teacherId: 'u_t1',
          semester: '2026/27 Semester 1', status: 'published', policy: 'approval', capacity: 40,
          description: 'Requirements engineering, architecture design, testing and team project management. Students build a full-stack system from requirements to delivery.',
          createdAt: iso(120),
        },
        {
          id: 'c2', code: 'COMP5511', name: 'Data Mining and Data Warehousing', teacherId: 'u_t2',
          semester: '2026/27 Semester 1', status: 'published', policy: 'open', capacity: 30,
          description: 'Data preprocessing, association rules, classification and clustering, with hands-on assignments on real datasets.',
          createdAt: iso(118),
        },
        {
          id: 'c3', code: 'COMP5421', name: 'Computer Vision', teacherId: 'u_t1',
          semester: '2026/27 Semester 1', status: 'published', policy: 'approval', capacity: 25,
          description: 'Image formation, feature detection, stereo vision and deep learning approaches to visual recognition.',
          createdAt: iso(110),
        },
        {
          id: 'c4', code: 'COMP5329', name: 'Deep Learning', teacherId: 'u_t2',
          semester: '2026/27 Semester 2', status: 'draft', policy: 'approval', capacity: 35,
          description: 'Neural network fundamentals, convolutional and recurrent architectures, training tricks and deployment.',
          createdAt: iso(9),
        },
        {
          id: 'c5', code: 'COMP5131', name: 'Distributed Systems', teacherId: 'u_t1',
          semester: '2026/27 Semester 1', status: 'published', policy: 'closed', capacity: 20,
          description: 'Clock synchronisation, replication, consensus and fault tolerance in large scale systems.',
          createdAt: iso(100),
        },
        {
          id: 'c6', code: 'COMP5401', name: 'Cloud Computing', teacherId: 'u_t2',
          semester: '2025/26 Semester 2', status: 'archived', policy: 'open', capacity: 30,
          description: 'Service models, virtualisation, containers and elasticity. Archived course kept for reference.',
          createdAt: iso(300),
        },
      ],
      enrollments: [
        { id: 'e1', courseId: 'c1', studentId: 'u_s1', status: 'approved', source: 'self_apply', appliedAt: iso(30), decidedAt: iso(29), decidedBy: 'u_t1' },
        { id: 'e2', courseId: 'c1', studentId: 'u_s2', status: 'pending', source: 'self_apply', appliedAt: iso(2), decidedAt: null, decidedBy: null },
        { id: 'e3', courseId: 'c1', studentId: 'u_s3', status: 'approved', source: 'self_apply', appliedAt: iso(28), decidedAt: iso(27), decidedBy: 'u_t1' },
        { id: 'e4', courseId: 'c2', studentId: 'u_s2', status: 'approved', source: 'teacher_add', appliedAt: iso(25), decidedAt: iso(25), decidedBy: 'u_t2' },
        { id: 'e5', courseId: 'c2', studentId: 'u_s3', status: 'approved', source: 'self_apply', appliedAt: iso(26), decidedAt: iso(24), decidedBy: 'u_t2' },
        { id: 'e6', courseId: 'c3', studentId: 'u_s1', status: 'pending', source: 'self_apply', appliedAt: iso(1), decidedAt: null, decidedBy: null },
        { id: 'e7', courseId: 'c2', studentId: 'u_s1', status: 'rejected', source: 'self_apply', appliedAt: iso(20), decidedAt: iso(19), decidedBy: 'u_t2' },
        { id: 'e8', courseId: 'c6', studentId: 'u_s1', status: 'approved', source: 'self_apply', appliedAt: iso(200), decidedAt: iso(199), decidedBy: 'u_t2' },
        { id: 'e9', courseId: 'c5', studentId: 'u_s2', status: 'approved', source: 'self_apply', appliedAt: iso(15), decidedAt: iso(14), decidedBy: 'u_t1' },
      ],
      materials: [
        { id: 'm1', courseId: 'c1', title: 'Lecture 01 — Software Lifecycle', pages: 12, size: 1887436, uploaderId: 'u_t1', createdAt: iso(21) },
        { id: 'm2', courseId: 'c1', title: 'Lecture 02 — Requirements Engineering', pages: 24, size: 3250585, uploaderId: 'u_t1', createdAt: iso(14) },
        { id: 'm3', courseId: 'c1', title: 'Project Brief and Rubric', pages: 6, size: 629145, uploaderId: 'u_t1', createdAt: iso(7) },
        { id: 'm4', courseId: 'c2', title: 'Week 01 — Introduction to Data Mining', pages: 30, size: 4404019, uploaderId: 'u_t2', createdAt: iso(20) },
        { id: 'm5', courseId: 'c2', title: 'Week 02 — Association Rules', pages: 28, size: 3879731, uploaderId: 'u_t2', createdAt: iso(13) },
        { id: 'm6', courseId: 'c3', title: 'Lecture 01 — Image Formation', pages: 22, size: 5347737, uploaderId: 'u_t1', createdAt: iso(18) },
        { id: 'm7', courseId: 'c5', title: 'Lecture 01 — Clock Synchronisation', pages: 19, size: 2516582, uploaderId: 'u_t1', createdAt: iso(16) },
        { id: 'm8', courseId: 'c6', title: 'Lecture 01 — Cloud Service Models', pages: 15, size: 1992294, uploaderId: 'u_t2', createdAt: iso(210) },
      ],
      audit: [
        { id: 'a1', actorId: 'u_t1', action: 'actUpload', target: 'Lecture 02 — Requirements Engineering', at: iso(14, 15) },
        { id: 'a2', actorId: 'u_t1', action: 'actApprove', target: '26072062g', at: iso(29, 9) },
        { id: 'a3', actorId: 'u_t2', action: 'actRole', target: '26072064g', at: iso(40, 11) },
        { id: 'a4', actorId: 'u_admin', action: 'actDisable', target: '26072065g', at: iso(3, 16) },
        { id: 'a5', actorId: 'u_s2', action: 'actApply', target: 'COMP5241 Software Engineering', at: iso(2, 20) },
        { id: 'a6', actorId: 'u_admin', action: 'actCreateCourse', target: 'COMP5329 Deep Learning', at: iso(9, 10) },
      ],
    };
  }

  function save(db) {
    memory = db;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* file:// 下可能不可用，退化为内存 */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === DB_VERSION) { memory = parsed; return parsed; }
      }
    } catch (e) { /* ignore */ }
    if (memory) return memory;
    const fresh = seed();
    save(fresh);
    return fresh;
  }

  function reset() {
    const fresh = seed();
    save(fresh);
    return fresh;
  }

  return { load, save, reset, KEY, DB_VERSION };
})();

if (typeof window !== 'undefined') { window.MOCK = MOCK; }
