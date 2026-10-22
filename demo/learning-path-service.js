/* Independent, deterministic mock service. No network requests or AI provider. */
const LearningPathMockService = (function () {
  function matchCourses(input, courses) {
    const published = courses.filter(function (c) { return c.status === 'published'; });
    if (input.courseId) return published.filter(function (c) { return c.id === input.courseId; }).map(function (c) { return c.id; });
    const text = (input.topic + ' ' + input.goal).toLowerCase();
    const aliases = {
      COMP5241: ['software engineering', '软件工程', 'requirements', '需求工程'],
      COMP5511: ['data mining', '数据挖掘', 'data warehouse', '数据仓库'],
      COMP5421: ['computer vision', '计算机视觉', 'image recognition', '图像识别'],
      COMP5329: ['deep learning', '深度学习', 'neural network', '神经网络'],
      COMP5131: ['distributed systems', '分布式系统', 'consensus', '共识'],
      COMP5401: ['cloud computing', '云计算'],
    };
    return published.map(function (c, index) {
      const phrases = [c.code.toLowerCase(), c.name.toLowerCase()].concat(aliases[c.code] || []);
      const score = phrases.some(function (phrase) { return text.includes(phrase); }) ? 10 :
        c.name.toLowerCase().split(/\W+/).filter(function (word) { return word.length > 3 && text.includes(word); }).length;
      return { id: c.id, score: score, index: index };
    }).filter(function (c) { return c.score > 0; }).sort(function (a, b) { return b.score - a.score || a.index - b.index; }).slice(0, 2).map(function (c) { return c.id; });
  }

  function generate(input, context) {
    if (!input || typeof input.topic !== 'string' || !input.topic.trim() || input.topic.length > 120 ||
      typeof input.goal !== 'string' || !input.goal.trim() || input.goal.length > 1000 ||
      !['beginner', 'intermediate', 'advanced'].includes(input.level) || !Number.isFinite(input.hours) ||
      input.hours < 1 || input.hours > 200 || input.hours * 2 % 1 !== 0 ||
      !context || typeof context.studentId !== 'string' || !Number.isInteger(context.version) || context.version < 1 || !Array.isArray(context.courses)) {
      throw new Error('Invalid learning path input');
    }
    if (input.courseId && !context.courses.some(function (c) { return c.id === input.courseId && c.status === 'published'; })) {
      throw new Error('Selected course is unavailable');
    }
    const kinds = input.level === 'beginner' ? ['foundation', 'practice', 'apply', 'review', 'extend'] :
      input.level === 'advanced' ? ['apply', 'review', 'extend'] : ['practice', 'apply', 'review', 'extend'];
    const courseIds = matchCourses(input, context.courses);
    const weights = { foundation: 2, practice: 3, apply: 4, review: 2, extend: 3 };
    const totalMinutes = Math.round(input.hours * 60);
    const taskCount = kinds.length * 2;
    // Give every task one minute, then apportion the remainder by stage weight.
    const remaining = totalMinutes - taskCount;
    const totalWeight = kinds.reduce(function (sum, kind) { return sum + weights[kind] * 2; }, 0);
    const allocations = kinds.flatMap(function (kind) { return [weights[kind], weights[kind]]; }).map(function (weight, index) {
      const exact = remaining * weight / totalWeight;
      return { index: index, minutes: 1 + Math.floor(exact), remainder: exact % 1 };
    });
    let extra = totalMinutes - allocations.reduce(function (sum, a) { return sum + a.minutes; }, 0);
    allocations.slice().sort(function (a, b) { return b.remainder - a.remainder || a.index - b.index; }).forEach(function (a) {
      if (extra > 0) { a.minutes++; extra--; }
    });
    return {
      studentId: context.studentId, version: context.version, topic: input.topic.trim(), goal: input.goal.trim(), level: input.level,
      hours: input.hours, courseId: input.courseId || null, createdAt: context.createdAt, generatedBy: 'local-template',
      generatorVersion: 2,
      stages: kinds.map(function (kind, stageIndex) {
        return { kind: kind, courseIds: courseIds.slice(), attempts: [], tasks: ['study', 'exercise'].map(function (type, taskIndex) {
          return { id: 'v' + context.version + '-s' + stageIndex + '-' + type, type: type,
            minutes: allocations[stageIndex * 2 + taskIndex].minutes, done: false, completedAt: null };
        }) };
      }),
    };
  }
  return { generate: generate };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LearningPathMockService;
