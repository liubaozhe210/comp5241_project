/* Hand-authored local sample questions, not AI-generated or extracted from PDFs. */
const LearningPathAssessment = (function () {
  function question(prompt, options, explanation, concept) {
    return { prompt: prompt, options: options, correct: 0, explanation: explanation, concept: concept };
  }
  const banks = {
    'se-v1': { kind: 'knowledge', title: ['Software engineering', '软件工程'], questions: [
      question(['Which is a testable requirement?', '哪项需求可以直接检验？'], [
        ['Return search results within two seconds for the specified test workload.', '在指定测试负载下，两秒内返回搜索结果。'],
        ['The system should feel good.', '系统应该让人感觉不错。'],
        ['Make everything perfect.', '把所有东西都做到完美。'],
      ], ['Measurable conditions and an explicit workload make acceptance testing possible.', '可度量的条件和明确的负载，使验收测试具有可操作的标准。'], ['Testable requirements', '可测试需求']),
      question(['What is the main purpose of a unit test?', '单元测试的主要目的是什么？'], [
        ['Check a small unit of behavior with controlled inputs.', '用受控输入检查一小部分行为。'],
        ['Replace all user acceptance testing.', '替代全部用户验收测试。'],
        ['Prove the whole system has no bugs.', '证明整个系统没有缺陷。'],
      ], ['Unit tests focus on small units; they complement integration and acceptance tests.', '单元测试聚焦小范围行为，需要与集成测试和验收测试配合。'], ['Testing levels', '测试层次']),
      question(['Why separate UI code from data access?', '为什么应将界面代码与数据访问分离？'], [
        ['Reduce coupling so either part can change and be tested more independently.', '降低耦合，使两部分更容易独立修改和测试。'],
        ['Eliminate the need for interfaces.', '消除接口的必要性。'],
        ['Guarantee faster network requests.', '保证网络请求更快。'],
      ], ['Separation of concerns improves maintainability; it does not guarantee network speed.', '职责分离有助于维护和测试，但不能保证网络速度。'], ['Separation of concerns', '职责分离']),
    ] },
    'data-v1': { kind: 'knowledge', title: ['Data mining', '数据挖掘'], questions: [
      question(['Why keep a test set separate from model training?', '为什么测试集应与模型训练分离？'], [
        ['Estimate performance on data not used to fit the model.', '评估模型在未用于拟合的数据上的表现。'],
        ['Make the training score always reach 100%.', '让训练得分总能达到 100%。'],
        ['Avoid checking model performance.', '避免检查模型表现。'],
      ], ['Training on the test set leaks evaluation information and biases the estimate.', '使用测试集训练会泄漏评估信息，导致评估结果有偏差。'], ['Data leakage', '数据泄漏']),
      question(['Which task is classification?', '哪项任务属于分类？'], [
        ['Predict whether an email is spam or not spam.', '预测邮件属于垃圾邮件还是正常邮件。'],
        ['Predict a continuous house price.', '预测连续数值的房价。'],
        ['Group unlabeled examples by similarity.', '按相似性对无标签样本分组。'],
      ], ['Classification predicts discrete labels; price prediction is regression and unlabeled grouping is clustering.', '分类预测离散标签；房价预测属于回归，无标签分组属于聚类。'], ['Classification versus clustering', '分类与聚类']),
      question(['Which preprocessing practice avoids leakage?', '哪种预处理方式有助于避免数据泄漏？'], [
        ['Fit scaling parameters on training data, then apply them to test data.', '仅用训练数据拟合缩放参数，再应用于测试数据。'],
        ['Fit scaling parameters on the full dataset before splitting.', '划分数据前用全部数据拟合缩放参数。'],
        ['Use test labels to choose training features.', '使用测试集标签选择训练特征。'],
      ], ['Preprocessing parameters should be learned from training data without using the held-out test set.', '预处理参数应从训练数据学习，不使用留出的测试集。'], ['Preprocessing', '数据预处理']),
    ] },
    'vision-v1': { kind: 'knowledge', title: ['Computer vision', '计算机视觉'], questions: [
      question(['What does an image pixel usually represent?', '图像中的像素通常表示什么？'], [
        ['An intensity or color value at a sampled image position.', '图像某个采样位置的强度或颜色值。'],
        ['A complete semantic description of an object.', '一个物体的完整语义描述。'],
        ['A guaranteed physical distance in meters.', '以米为单位的确定物理距离。'],
      ], ['Pixels store sampled intensity or color; physical interpretation needs additional information.', '像素保存采样后的强度或颜色，物理解释还需要其他信息。'], ['Image representation', '图像表示']),
      question(['What does an edge detector typically look for?', '边缘检测通常寻找什么？'], [
        ['Significant local changes in image intensity.', '图像强度在局部的明显变化。'],
        ['Only the file name of an image.', '只检查图像文件名。'],
        ['An object label for every image without analysis.', '无需分析就给每张图像确定物体标签。'],
      ], ['Intensity changes can indicate boundaries, but edges alone do not identify objects.', '强度变化可能对应边界，但仅凭边缘不能直接确定物体类别。'], ['Edges and gradients', '边缘与梯度']),
      question(['How should augmentation be used in a held-out evaluation?', '在留出集评估中，应如何使用数据增强？'], [
        ['Augment training data while keeping evaluation independent of training examples.', '对训练数据增强，同时保持评估与训练样本独立。'],
        ['Put transformed copies of a test image into the training set.', '将测试图像的变换副本放入训练集。'],
        ['Choose transformations using test labels until the score improves.', '用测试标签反复选择变换直到分数提高。'],
      ], ['Transformed versions of held-out examples can leak information into training.', '将留出样本的变换版本用于训练可能造成信息泄漏。'], ['Evaluation integrity', '评估独立性']),
    ] },
    'distributed-v1': { kind: 'knowledge', title: ['Distributed systems', '分布式系统'], questions: [
      question(['Why can retries create duplicate effects?', '为什么重试可能造成重复操作？'], [
        ['The first request may have succeeded even if its response was lost.', '首次请求可能已成功，但响应丢失。'],
        ['A timeout proves the server did nothing.', '超时证明服务端没有执行操作。'],
        ['Networks always deliver each message exactly once.', '网络总能保证每条消息只交付一次。'],
      ], ['Use idempotent operations or deduplication keys when retrying actions with side effects.', '对有副作用的操作进行重试时，应使用幂等操作或去重标识。'], ['Idempotency', '幂等性']),
      question(['What is one purpose of replication?', '复制机制的一个用途是什么？'], [
        ['Keep copies of data on multiple nodes to improve availability.', '在多个节点保存数据副本以提升可用性。'],
        ['Remove all consistency tradeoffs automatically.', '自动消除所有一致性权衡。'],
        ['Guarantee that hardware cannot fail.', '保证硬件不会故障。'],
      ], ['Replication helps tolerate failures but introduces coordination and consistency questions.', '复制有助于容错，也会引入协调与一致性问题。'], ['Replication', '数据复制']),
      question(['What does a logical clock help describe?', '逻辑时钟有助于描述什么？'], [
        ['Event ordering without assuming perfectly synchronized physical clocks.', '无需假设物理时钟完全同步即可描述事件顺序。'],
        ['An exact global wall-clock time for every event.', '每个事件精确的全局物理时间。'],
        ['A guarantee of zero message delay.', '消息延迟为零的保证。'],
      ], ['Logical clocks capture ordering information, not exact elapsed physical time.', '逻辑时钟记录顺序信息，而非精确的物理耗时。'], ['Event ordering', '事件顺序']),
    ] },
    'methods-v1': { kind: 'methods', title: ['Learning methods', '学习方法'], questions: [
      question(['How can you check whether you understand a concept?', '如何检查自己是否理解了概念？'], [
        ['Explain it from memory, then verify with a reliable reference.', '脱离资料解释，再用可靠资料核对。'], ['Reread only the title.', '只反复阅读标题。'], ['Mark complete without trying.', '不尝试就标记完成。'],
      ], ['Recall followed by verification reveals gaps in understanding.', '主动回忆后核对资料，有助于发现理解中的缺口。'], ['Active recall', '主动回忆']),
      question(['What should you do after making a mistake?', '练习出错后应如何处理？'], [
        ['Identify the cause, review the concept and retry a similar task.', '分析原因、复习概念，再做类似练习。'], ['Skip the topic permanently.', '永久跳过该主题。'], ['Copy the answer without reasoning.', '不理解推理就抄答案。'],
      ], ['Targeted correction and a fresh attempt provide better evidence than copying.', '针对性纠错和重新尝试比抄答案更能检验理解。'], ['Deliberate practice', '针对性练习']),
      question(['What best demonstrates achievement of a learning goal?', '什么更能证明学习目标已经达成？'], [
        ['Independent work evaluated against explicit criteria.', '独立完成任务并按明确标准评价。'], ['Time spent with a PDF open.', 'PDF 打开的时长。'], ['The number of highlighted sentences.', '划线句子的数量。'],
      ], ['Observable work checked against criteria gives evidence of achievement.', '依据标准检验可观察的成果，才能提供目标达成的证据。'], ['Evidence of learning', '学习成果证据']),
    ] },
  };
  function getBank(id) { return banks[id] || null; }
  function selectBank(plan, stage, courses) {
    const text = (plan.topic + ' ' + plan.goal).toLowerCase();
    if (/software engineering|软件工程|requirements|需求工程/.test(text)) return banks['se-v1'];
    if (/data mining|数据挖掘|data warehouse|数据仓库/.test(text)) return banks['data-v1'];
    if (/computer vision|计算机视觉|image recognition|图像识别/.test(text)) return banks['vision-v1'];
    if (/distributed systems|分布式系统/.test(text)) return banks['distributed-v1'];
    const map = { COMP5241: 'se-v1', COMP5511: 'data-v1', COMP5421: 'vision-v1', COMP5131: 'distributed-v1' };
    const ids = stage.courseIds || (plan.courseId ? [plan.courseId] : []);
    const course = courses.find(function (c) { return ids.includes(c.id) && map[c.code]; });
    return banks[course ? map[course.code] : 'methods-v1'];
  }
  Object.keys(banks).forEach(function (id) { banks[id].id = id; });
  function grade(bankId, answers, at) {
    const bank = getBank(bankId);
    if (!bank || !Array.isArray(answers) || answers.length !== bank.questions.length ||
      !answers.every(function (answer) { return Number.isInteger(answer) && answer >= 0 && answer < 3; })) throw new Error('Invalid quiz answers');
    return { bankId: bankId, answers: answers.slice(), score: answers.filter(function (a, i) { return a === bank.questions[i].correct; }).length,
      maxScore: bank.questions.length, at: at };
  }
  function recommendation(stage) {
    const attempt = stage.attempts[stage.attempts.length - 1];
    if (!attempt) return null;
    if (attempt.score <= 1) return 'review';
    if (attempt.score === 2) return 'practice';
    return stage.tasks.every(function (task) { return task.done; }) ? 'challenge' : null;
  }
  function apply(stage, version, index, attemptIndex, at) {
    if (!Number.isInteger(attemptIndex) || attemptIndex !== stage.attempts.length - 1) return null;
    const type = recommendation(stage);
    if (!type || (stage.adjustments || []).some(function (a) { return a.attemptIndex === attemptIndex; })) return null;
    // Avoid stacking the same unfinished recommendation after repeated retakes.
    if (stage.tasks.some(function (task) { return task.type === type && !task.done; })) return null;
    const task = { id: 'v' + version + '-s' + index + '-' + type + '-a' + attemptIndex, type: type,
      minutes: { review: 15, practice: 20, challenge: 30 }[type], done: false, completedAt: null };
    stage.tasks.push(task);
    if (!stage.adjustments) stage.adjustments = [];
    stage.adjustments.push({ attemptIndex: attemptIndex, type: type, taskId: task.id, at: at, minutes: task.minutes });
    return task;
  }
  return { getBank: getBank, selectBank: selectBank, grade: grade, recommendation: recommendation, apply: apply };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LearningPathAssessment;
