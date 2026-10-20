/* Curated local examples for the PDF course prototype. No PDF text is extracted. */
const PDF_COURSE_CONTENT = {
  en: {
    requirements: {
      title: 'From vague ideas to clear requirements',
      goals: ['Ask questions that reveal a real user need.', 'Separate features from quality constraints.', 'Write a requirement that can be tested.'],
      units: [
        ['Start with the problem', 'A feature request is a starting point. Understand the task before deciding what to build.', 'Ask who experiences the problem, what they do today, and how they would recognise an improvement. Record assumptions separately from confirmed needs.', 'A campus cafe asks for an app. You discover that students mainly need to avoid queues between lectures. Pre-ordering might help; a simpler collection process might also help.', 'What should you ask first when a cafe requests an app?', ['Which colour should the app use?', 'Who experiences the problem and what happens today?', 'Which framework should we choose?'], 1, 'Understanding the current problem helps you evaluate several possible solutions. Choosing a framework or colour comes later.'],
        ['Features and quality constraints', 'Functional requirements describe behaviour. Quality requirements describe how well that behaviour must work.', 'Make constraints concrete: response time, access permissions, accessibility and reliability can all affect design. Avoid words such as fast or secure without a measurable condition.', 'Feature: students can cancel an order before preparation begins. Quality: 95% of order confirmations appear within two seconds under the agreed test load.', 'Which requirement is specific enough to check?', ['The system must be very fast.', 'The interface should be modern.', '95% of confirmations appear within two seconds under an agreed test load.'], 2, 'The percentage, response time and test conditions provide a practical basis for verification.'],
        ['Turn needs into acceptance criteria', 'Acceptance criteria connect a user need to observable behaviour.', 'Use Given / When / Then to describe a starting condition, an action and an expected result. Include an important exception as well as the successful path.', 'Given an order has not entered preparation, when its owner cancels it, then the order is marked cancelled and cannot enter preparation.', 'What is missing from “The student clicks cancel”?', ['An observable expected result.', 'A particular programming language.', 'A longer button label.'], 0, 'A user action alone does not say what the system should do. Add the starting condition and observable outcome.'],
      ],
      challenge: {
        title: 'Your turn: interview the cafe owner',
        prompt: 'The owner says, “Let students cancel whenever they want.” Write a follow-up question, one acceptance criterion and one exception that you would clarify before implementation.',
        criteria: [['User and context', ['student', 'owner', 'user', '学生', '用户']], ['Cancellation boundary', ['prepar', 'before', 'after', '准备', '制作', '之前', '之后']], ['Observable result or exception', ['refund', 'reject', 'cancelled', 'status', '退款', '拒绝', '状态', '取消']]],
        sample: 'I would ask when preparation starts and whether payment has already been collected. Given an order is awaiting preparation, when its owner cancels it, then its status becomes cancelled. If preparation has started, cancellation is rejected with an explanation; the refund policy needs confirmation.',
      },
    },
    agents: {
      title: 'Work effectively with AI coding agents',
      goals: ['Delegate a small, clearly bounded task.', 'Give an agent useful context and constraints.', 'Verify a change before accepting it.'],
      units: [
        ['Delegate a bounded task', 'Give an agent a task whose outcome you can inspect and verify.', 'State the problem, the files or behaviour it may change, and the conditions for success. Keep decisions about user needs and trade-offs visible to the team.', 'Ask for input validation on one enrollment endpoint, with tests for missing fields and invalid capacity, instead of asking the agent to build the whole platform in one step.', 'Which task is easiest to review?', ['Build everything and make it good.', 'Change anything needed without reporting it.', 'Validate one endpoint and add tests for two specified cases.'], 2, 'A bounded task and concrete checks make the result easier to understand and verify.'],
        ['Describe the context', 'An agent needs relevant context rather than a large, unstructured instruction.', 'Explain the current behaviour, expected behaviour, constraints and examples. Ask the agent to identify uncertainty before making a consequential assumption.', 'An approved enrollment must be unique for each student and course. Re-applying after rejection should update the same record. Ask for an explanation of the proposed state transitions.', 'What helps an agent handle a rejected enrollment correctly?', ['The state transitions and an example of the expected result.', 'Only the name of the application.', 'A request to produce more code.'], 0, 'Explicit state transitions clarify behaviour that the agent would otherwise have to guess.'],
        ['Review and verify', 'Generated code is a proposed change that needs evidence.', 'Read the changes, run relevant tests and check failure paths. Record what you accepted, what you changed and why. A passing happy-path test does not establish all requirements.', 'For enrollment approval, test an available seat, a full course, duplicate approval and a teacher attempting to approve another teacher’s course.', 'What should you do before accepting an AI change?', ['Accept it because it compiles.', 'Inspect the change and verify important success and failure paths.', 'Use the number of generated lines as the quality score.'], 1, 'Compilation is useful but does not verify permissions, business rules or failure behaviour.'],
      ],
      challenge: {
        title: 'Your turn: write an agent task',
        prompt: 'Write a task for an AI agent to fix enrollment approval exceeding capacity. Include a boundary on changes, an acceptance condition and how you will verify the result.',
        criteria: [['Clear task boundary', ['endpoint', 'approval', 'service', '接口', '审批', '服务']], ['Capacity rule', ['capacity', 'full', 'seat', '容量', '满', '名额']], ['Verification evidence', ['test', 'verify', 'check', '测试', '验证', '检查']]],
        sample: 'Change only the enrollment approval service and its related tests. Approval must fail when approved members already equal capacity, without changing the pending record. Test the full course, the last available seat and repeated approval; show the diff and test results for review.',
      },
    },
    testing: {
      title: 'Design tests that protect real behaviour',
      goals: ['Describe observable expected behaviour.', 'Choose useful boundary and failure cases.', 'Use a regression test to protect a fix.'],
      units: [
        ['Test observable behaviour', 'A useful test links a requirement to an observable result.', 'Arrange a meaningful starting state, perform one action, and assert the result and important side effects. Avoid assertions that only repeat internal implementation details.', 'With a pending enrollment, approving it should grant course access and record the decision. The test checks the new status and access result.', 'Which assertion best checks the requirement?', ['The function contains an if statement.', 'The student gains access after approval.', 'The source file has many lines.'], 1, 'The access result expresses what the user needs, rather than how the function happens to be written.'],
        ['Explore boundaries', 'Boundary cases reveal mistakes that ordinary examples miss.', 'For a capacity rule, test below capacity, exactly at capacity and an attempt to exceed it. Also consider invalid input and roles that must be denied.', 'If a course has capacity 20, test approval with 19 approved students, with 20 approved students and a repeated approval of the same student.', 'Which case is most likely to expose a capacity boundary error?', ['A course with zero students and capacity 20.', 'Only checking that the page opens.', 'A course already at capacity receiving one more approval.'], 2, 'Testing the limit directly helps expose missing checks and off-by-one errors.'],
        ['Protect a fix with regression tests', 'A regression test captures a failure so it is less likely to return.', 'Reproduce the defect, write a test for the expected behaviour, make the smallest relevant fix and run the affected checks. Record any remaining limitations.', 'A student could open a draft course by its direct URL. A regression test now checks both its absence from the catalog and denial of direct access.', 'What should a regression test capture?', ['The specific behaviour that failed and its expected outcome.', 'Only the developer’s preferred variable names.', 'Every unrelated page in the application.'], 0, 'A focused regression test preserves evidence of the defect and the behaviour the fix must maintain.'],
      ],
      challenge: {
        title: 'Your turn: design a regression test',
        prompt: 'A student can view a draft course using its direct URL. Describe the initial state, action and expected result. Add a check that an authorised teacher can still access the draft.',
        criteria: [['Starting state', ['draft', 'student', '草稿', '学生']], ['Action and denial', ['url', '403', '404', 'denied', 'direct', '地址', '拒绝', '直接']], ['Authorised comparison', ['teacher', 'owner', '教师', '老师', '所有者']]],
        sample: 'Arrange a draft course owned by Teacher A and an unrelated student. As the student, request the course’s direct URL and expect 403 or 404 with no course content. Then request it as Teacher A and expect access. Also verify that the draft does not appear in the student catalog.',
      },
    },
    advanced: 'Go further: identify one assumption in this example and explain how you would validate it with a stakeholder or a test.',
  },
  zh: {
    requirements: {
      title: '把模糊想法变成清晰需求',
      goals: ['通过提问发现真实的用户需求。', '区分功能需求和质量约束。', '写出可以验证的验收条件。'],
      units: [
        ['先理解问题', '功能请求是讨论的起点。决定做什么之前，先理解用户要完成的任务。', '问清楚谁遇到了问题、现在如何处理，以及怎样判断情况有所改善。把尚未验证的假设与已经确认的需求分开记录。', '校园咖啡店希望开发一个 App。访谈发现，学生主要想减少课间排队时间。预订可能有帮助，改进取餐流程也可能有帮助。', '咖啡店提出要开发 App 时，应该先问什么？', ['App 应该使用什么颜色？', '谁遇到了问题，现在的流程是什么？', '应该选择哪个开发框架？'], 1, '先理解当前的问题，才能比较不同解决方案的价值。颜色与框架可以在之后讨论。'],
        ['功能与质量约束', '功能需求描述系统做什么，质量需求描述系统需要做得怎样。', '把响应时间、访问权限、无障碍和可靠性等约束写具体。避免只写“快”“安全”，而不给出可检查的条件。', '功能：订单开始制作前，学生可以取消。质量：在约定测试负载下，95% 的订单确认在两秒内显示。', '哪条需求可以直接用于检查？', ['系统必须非常快。', '界面应该现代。', '在约定测试负载下，95% 的订单确认在两秒内显示。'], 2, '比例、响应时间和测试条件共同构成了可验证的标准。'],
        ['写出验收条件', '验收条件把用户需求与可观察的系统行为连接起来。', '使用“给定／当／那么”描述初始条件、操作和预期结果。在成功流程之外，补充一个重要的异常情况。', '给定订单尚未开始制作，当订单所有者取消订单，那么订单状态变为已取消，且不能再进入制作流程。', '“学生点击取消”还缺少什么？', ['可以观察的预期结果。', '指定的编程语言。', '更长的按钮文字。'], 0, '只描述操作，还没有说明系统应该如何响应。需要补充起始条件和预期结果。'],
      ],
      challenge: {
        title: '轮到你：访谈咖啡店店主',
        prompt: '店主说：“让学生想取消时就取消。”请写一个追问、一条验收条件，以及实现前需要澄清的一种例外情况。',
        criteria: [['用户与场景', ['学生', '用户', '店主', 'student', 'owner']], ['取消的时间边界', ['准备', '制作', '之前', '之后', 'prepar', 'before', 'after']], ['可观察结果或例外', ['退款', '拒绝', '状态', '取消', 'refund', 'reject', 'status']]],
        sample: '我会先问：订单何时开始制作，付款是否已经完成？给定订单尚未制作，当订单所有者取消时，订单状态变为已取消。如果已经开始制作，应拒绝取消并说明原因；退款规则需要另行确认。',
      },
    },
    agents: {
      title: '有效地与 AI 编程代理协作',
      goals: ['委派边界清晰的小任务。', '提供有效的上下文与约束。', '在接受改动前检查并验证结果。'],
      units: [
        ['委派有边界的任务', '选择一个结果能够被检查和验证的任务交给代理。', '说明问题、允许改动的范围和成功标准。团队仍需明确用户需求，并记录关键设计取舍。', '让代理只为一个选课接口增加输入校验，并测试缺少字段与容量无效两种情况，比一次要求生成整个平台更容易检查。', '哪个任务最容易进行评审？', ['把所有功能都做好。', '随意修改，不用说明。', '校验一个接口，并为指定的两种情况补充测试。'], 2, '清晰的范围和具体检查条件让结果更容易理解与验证。'],
        ['描述有效的上下文', '代理需要相关上下文，而不是一大段没有结构的指令。', '说明当前行为、期望行为、限制和例子。遇到重要但不确定的条件时，让代理先指出问题。', '同一学生在同一门课只能有一条选课记录。被拒绝后重新申请应复用原记录，并说明状态如何变化。', '什么信息有助于代理正确处理被拒绝后的重新申请？', ['明确的状态迁移和期望结果示例。', '只有应用名称。', '要求生成更多代码。'], 0, '明确状态迁移可以减少代理对业务行为的猜测。'],
        ['检查并验证结果', '生成的代码是一份需要证据支持的改动方案。', '阅读差异、运行相关测试并检查失败路径。记录接受了什么、修改了什么以及原因。成功流程通过，不代表全部需求都已验证。', '审批选课时，分别测试有剩余名额、已满员、重复审批，以及教师操作其他教师课程的情况。', '接受 AI 改动前应该做什么？', ['能编译就直接接受。', '检查改动，并验证关键成功和失败路径。', '根据生成代码的行数评分。'], 1, '编译通过不能证明权限、业务规则和异常情况正确。'],
      ],
      challenge: {
        title: '轮到你：写一条代理任务',
        prompt: '请给 AI 代理写一条修复“选课审批超出容量”的任务。包含改动范围、验收条件和验证方法。',
        criteria: [['明确改动范围', ['接口', '审批', '服务', 'endpoint', 'approval']], ['容量规则', ['容量', '满', '名额', 'capacity', 'full', 'seat']], ['验证证据', ['测试', '验证', '检查', 'test', 'verify', 'check']]],
        sample: '只修改选课审批服务及相关测试。当已通过人数达到容量时，审批应失败，并保留待审记录。测试课程已满、最后一个名额和重复审批三种情况，提交代码差异和测试结果供评审。',
      },
    },
    testing: {
      title: '用测试保护真实的业务行为',
      goals: ['描述可以观察的预期行为。', '选择有效的边界和失败用例。', '通过回归测试保护修复结果。'],
      units: [
        ['测试可观察的行为', '有效测试把一条需求与可以观察的结果联系起来。', '准备明确的初始状态，执行一个操作，再检查结果及重要副作用。避免只重复代码内部的实现细节。', '审批一条待审选课记录后，学生应获得课程访问权限，并记录审批决定。测试需要检查状态与访问结果。', '哪个断言最能检查需求？', ['函数里包含 if 语句。', '审批后学生获得课程访问权限。', '源文件包含很多行。'], 1, '访问结果体现了用户需要的行为，而不是当前函数采用的写法。'],
        ['检查边界情况', '边界用例可以发现普通示例遗漏的问题。', '容量规则应覆盖低于上限、恰好达到上限，以及试图超出上限的情况。同时考虑无效输入和无权限角色。', '课程容量为 20 时，分别测试已有 19 人、已有 20 人，以及重复审批同一个学生。', '哪个用例最可能暴露容量边界错误？', ['只有 0 个学生、容量为 20。', '只检查页面能打开。', '课程已经满员，仍尝试通过另一个申请。'], 2, '直接检查上限附近的情况，有助于发现遗漏检查和边界错误。'],
        ['用回归测试保护修复', '回归测试记录曾经发生的失败，减少问题再次出现的机会。', '复现缺陷，为预期行为写测试，进行相关修复，再运行受影响的检查。记录尚未验证的部分。', '学生曾可通过直接地址打开草稿课程。回归测试现在既检查目录不展示草稿，也检查直接访问被拒绝。', '回归测试应该记录什么？', ['曾失败的具体行为及其预期结果。', '开发者喜欢的变量名。', '全部不相关页面。'], 0, '有针对性的测试能够保留缺陷证据，并明确修复需要维持的行为。'],
      ],
      challenge: {
        title: '轮到你：设计回归测试',
        prompt: '学生能够通过直接地址查看草稿课程。请描述测试初始状态、操作和预期结果，并增加一个检查：授权教师仍可以访问自己的草稿。',
        criteria: [['初始状态', ['草稿', '学生', 'draft', 'student']], ['访问操作与拒绝结果', ['地址', '拒绝', '直接', 'url', '403', '404', 'denied']], ['授权角色对照', ['教师', '老师', '所有者', 'teacher', 'owner']]],
        sample: '准备一门属于教师 A 的草稿课程和一名无关学生。学生直接请求课程地址，应返回 403 或 404，且不显示课程内容。教师 A 请求同一地址应成功。另外检查学生课程目录中不存在这门草稿课程。',
      },
    },
    advanced: '进一步思考：找出示例中的一个假设，并说明如何通过用户访谈或测试验证它。',
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = PDF_COURSE_CONTENT;
