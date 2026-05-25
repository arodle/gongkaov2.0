import { NextResponse } from 'next/server';
import { upsertKnowledgeNode } from '@/lib/db/neon-service';

const KNOWLEDGE_TREE = {
  id: 'root_xingce',
  name: '行测',
  type: 'subject',
  content: '行政职业能力测验，简称行测，是公务员考试笔试公共科目之一，主要测查与公务员职业密切相关的、适合通过客观化纸笔测验方式进行考查的基本素质和能力要素。',
  annotation: '行测一般为120分钟，130-135题，时间紧任务重',
  children: [
    {
      id: 'k_speech',
      name: '言语理解与表达',
      type: 'knowledge',
      content: '主要测查运用语言文字进行思考和交流、迅速准确地理解和把握文字材料内涵的能力。',
      children: [
        {
          id: 'sk_reading',
          name: '片段阅读',
          type: 'subknowledge',
          content: '给定一段文字，要求根据文字内容回答问题，常见题型包括主旨概括、意图判断、细节理解等。',
          children: [
            { id: 'a_central', name: '中心理解题', type: 'angle', content: '要求概括文段的主旨或中心思想，包括主旨概括、意图判断等题型。' },
            { id: 'a_detail', name: '细节判断题', type: 'angle', content: '要求判断选项与原文信息是否一致，考查细致阅读能力。' },
            { id: 'a_title', name: '标题填入题', type: 'angle', content: '要求为文段选择最合适的标题，考查对文段核心内容的把握。' },
            { id: 'a_attitude', name: '态度理解题', type: 'angle', content: '要求判断作者的态度、观点或立场。' },
            { id: 'a_expression', name: '词句理解题', type: 'angle', content: '要求理解文中特定词语或句子的含义。' },
          ],
        },
        {
          id: 'sk_sentence',
          name: '语句表达',
          type: 'subknowledge',
          content: '考查对语句连贯性、逻辑性的把握能力。',
          children: [
            { id: 'a_sort', name: '语句排序', type: 'angle', content: '要求将打乱顺序的句子重新排列成连贯的段落。' },
            { id: 'a_fill', name: '语句填空', type: 'angle', content: '要求在文段空白处填入最合适的句子。' },
            { id: 'a_next', name: '接语选择', type: 'angle', content: '要求推断文段接下来最可能讲述的内容。' },
          ],
        },
        {
          id: 'sk_logic_fill',
          name: '逻辑填空',
          type: 'subknowledge',
          content: '在文段中填入最恰当的词语，考查实词、成语、虚词的辨析能力。',
          children: [
            { id: 'a_real_word', name: '实词填空', type: 'angle', content: '辨析近义实词的细微差别，包括词义轻重、范围大小、感情色彩、搭配习惯等。' },
            { id: 'a_idiom', name: '成语填空', type: 'angle', content: '辨析常见成语的含义、适用对象、感情色彩、近义成语的区别。' },
            { id: 'a_mixed', name: '混搭填空', type: 'angle', content: '实词和成语混合考查的填空题。' },
          ],
        },
        {
          id: 'sk_passage',
          name: '篇章阅读',
          type: 'subknowledge',
          content: '针对较长篇章的综合阅读理解，考查多种能力的综合运用。',
          children: [
            { id: 'a_passage_detail', name: '细节判断', type: 'angle', content: '针对篇章内容的细节理解题。' },
            { id: 'a_passage_main', name: '主旨概括', type: 'angle', content: '概括整个篇章的主旨大意。' },
            { id: 'a_passage_word', name: '词句理解', type: 'angle', content: '理解篇章中特定词语或句子的含义。' },
            { id: 'a_passage_fill', name: '逻辑填空', type: 'angle', content: '篇章中的词语填空题。' },
          ],
        },
      ],
    },
    {
      id: 'k_reasoning',
      name: '判断推理',
      type: 'knowledge',
      content: '主要测查对各种事物关系的分析推理能力，包括图形推理、定义判断、类比推理、逻辑判断等。',
      children: [
        {
          id: 'sk_graph',
          name: '图形推理',
          type: 'subknowledge',
          content: '根据图形规律选择正确答案，考查观察、分析和推理能力。',
          children: [
            { id: 'a_position', name: '位置规律', type: 'angle', content: '平移、旋转、翻转等位置变化规律。' },
            { id: 'a_style', name: '样式规律', type: 'angle', content: '遍历、加减同异、黑白运算等样式变化规律。' },
            { id: 'a_attribute', name: '属性规律', type: 'angle', content: '对称、曲直、开闭等属性特征。' },
            { id: 'a_quantity', name: '数量规律', type: 'angle', content: '点、线、面、角、素等数量变化规律。' },
            { id: 'a_special', name: '特殊规律', type: 'angle', content: '图形间关系、功能元素等特殊规律。' },
            { id: 'a_3d', name: '空间重构', type: 'angle', content: '六面体、四面体等空间图形的折叠与展开。' },
            { id: 'a_3d_puzzle', name: '立体拼合/截面/三视图', type: 'angle', content: '立体图形的拼接、截面形状判断、三视图识别。' },
          ],
        },
        {
          id: 'sk_definition',
          name: '定义判断',
          type: 'subknowledge',
          content: '根据给出的定义判断选项是否符合定义要求。',
          children: [
            { id: 'a_single_def', name: '单定义判断', type: 'angle', content: '根据一个定义进行判断。' },
            { id: 'a_multi_def', name: '多定义判断', type: 'angle', content: '根据多个相关定义进行判断和区分。' },
          ],
        },
        {
          id: 'sk_analogy',
          name: '类比推理',
          type: 'subknowledge',
          content: '根据两个或多个事物之间的关系，找出相似的选项。',
          children: [
            { id: 'a_semantic', name: '语义关系', type: 'angle', content: '近义、反义、比喻象征等语义关系。' },
            { id: 'a_logic', name: '逻辑关系', type: 'angle', content: '全同、并列、包容、交叉、对应等逻辑关系。' },
            { id: 'a_grammar', name: '语法关系', type: 'angle', content: '主谓、动宾、偏正等语法关系。' },
          ],
        },
        {
          id: 'sk_logic',
          name: '逻辑判断',
          type: 'subknowledge',
          content: '根据逻辑规则进行推理和判断，包括多种逻辑推理题型。',
          children: [
            { id: 'a_translate', name: '翻译推理', type: 'angle', content: '将自然语言翻译成逻辑表达式进行推理。' },
            { id: 'a_true_false', name: '真假推理', type: 'angle', content: '根据给定条件判断命题的真假。' },
            { id: 'a_analysis', name: '分析推理', type: 'angle', content: '根据条件进行分析和推理，解决逻辑问题。' },
            { id: 'a_strengthen', name: '加强论证', type: 'angle', content: '寻找能够支持论点的论据。' },
            { id: 'a_weaken', name: '削弱论证', type: 'angle', content: '寻找能够削弱论点的论据。' },
            { id: 'a_induction', name: '归纳推理', type: 'angle', content: '根据个别事例归纳出一般结论。' },
            { id: 'a_explain', name: '原因解释', type: 'angle', content: '解释现象或矛盾产生的原因。' },
          ],
        },
      ],
    },
    {
      id: 'k_quantity',
      name: '数量关系',
      type: 'knowledge',
      content: '主要测查理解、把握事物间量化关系和解决数量关系问题的能力。',
      children: [
        {
          id: 'sk_math',
          name: '数学运算',
          type: 'subknowledge',
          content: '运用数学知识解决实际问题，包括多种经典题型。',
          children: [
            { id: 'a_basic_calc', name: '基础计算', type: 'angle', content: '整除、倍数、余数、平均数等基础计算问题。' },
            { id: 'a_engineering', name: '工程问题', type: 'angle', content: '工作效率、工作时间、工作量之间的关系。' },
            { id: 'a_travel', name: '行程问题', type: 'angle', content: '相遇、追及、流水行船等行程问题。' },
            { id: 'a_profit', name: '利润问题', type: 'angle', content: '成本、售价、利润、利润率之间的计算。' },
            { id: 'a_concentration', name: '浓度问题', type: 'angle', content: '溶液浓度的混合与计算。' },
            { id: 'a_age', name: '年龄问题', type: 'angle', content: '根据年龄关系进行计算和推理。' },
            { id: 'a_set', name: '容斥原理', type: 'angle', content: '集合之间的交集、并集计算。' },
            { id: 'a_permutation', name: '排列组合', type: 'angle', content: '排列数、组合数的计算和应用。' },
            { id: 'a_probability', name: '概率问题', type: 'angle', content: '事件发生概率的计算。' },
            { id: 'a_max_min', name: '最值问题', type: 'angle', content: '求最大值或最小值的问题。' },
            { id: 'a_geometry', name: '几何问题', type: 'angle', content: '平面几何和立体几何相关计算。' },
            { id: 'a_coordination', name: '统筹问题', type: 'angle', content: '资源优化配置问题。' },
            { id: 'a_cycle', name: '周期问题', type: 'angle', content: '周期性规律相关问题。' },
          ],
        },
        {
          id: 'sk_number',
          name: '数字推理',
          type: 'subknowledge',
          content: '根据数列规律找出空缺项，部分省份考试考查。',
          children: [
            { id: 'a_basic_seq', name: '基础数列', type: 'angle', content: '等差、等比、和、积、幂、递推等基础数列。' },
            { id: 'a_multi_seq', name: '多重数列', type: 'angle', content: '交叉数列、分组数列等多重规律数列。' },
            { id: 'a_fraction', name: '分数数列', type: 'angle', content: '分数形式的数列规律。' },
            { id: 'a_matrix', name: '图形数阵', type: 'angle', content: '图形中的数字规律。' },
          ],
        },
      ],
    },
    {
      id: 'k_data',
      name: '资料分析',
      type: 'knowledge',
      content: '主要测查对各种形式的文字、图表等资料的综合理解与分析加工能力。',
      children: [
        {
          id: 'sk_terms',
          name: '基础统计术语',
          type: 'subknowledge',
          content: '掌握资料分析中常用的统计概念和术语。',
          children: [
            { id: 'a_base_current', name: '基期/现期', type: 'angle', content: '基础时期和当前时期的数据。' },
            { id: 'a_growth', name: '增长量/增长率', type: 'angle', content: '数据的增长数量和增长比例。' },
            { id: 'a_proportion', name: '比重、平均数、倍数', type: 'angle', content: '数据之间的比例关系。' },
            { id: 'a_compare', name: '同比/环比、百分点', type: 'angle', content: '不同时期数据的比较方式。' },
          ],
        },
        {
          id: 'sk_speed',
          name: '速算技巧',
          type: 'subknowledge',
          content: '提高计算速度的技巧和方法。',
          children: [
            { id: 'a_truncate', name: '截位直除', type: 'angle', content: '截取有效数字进行除法计算。' },
            { id: 'a_compare', name: '分数比较', type: 'angle', content: '快速比较分数大小的方法。' },
            { id: 'a_estimate', name: '估算', type: 'angle', content: '近似计算的技巧。' },
          ],
        },
        {
          id: 'sk_simple',
          name: '简单计算与比较',
          type: 'subknowledge',
          content: '直接查找和简单计算的题目。',
          children: [],
        },
        {
          id: 'sk_base_current',
          name: '基期与现期',
          type: 'subknowledge',
          content: '基期和现期相关的计算问题。',
          children: [],
        },
        {
          id: 'sk_growth',
          name: '增长量',
          type: 'subknowledge',
          content: '增长量相关的计算问题。',
          children: [],
        },
        {
          id: 'sk_rate',
          name: '增长率',
          type: 'subknowledge',
          content: '增长率相关的计算问题。',
          children: [],
        },
        {
          id: 'sk_ratio',
          name: '比重相关',
          type: 'subknowledge',
          content: '比重相关的计算和比较问题。',
          children: [],
        },
        {
          id: 'sk_average',
          name: '平均数与倍数',
          type: 'subknowledge',
          content: '平均数和倍数相关的计算问题。',
          children: [],
        },
        {
          id: 'sk_comprehensive',
          name: '综合分析',
          type: 'subknowledge',
          content: '对资料进行综合分析和判断。',
          children: [],
        },
      ],
    },
    {
      id: 'k_common',
      name: '常识判断',
      type: 'knowledge',
      content: '测查应知应会的基本知识以及运用这些知识分析判断的基本能力。',
      children: [
        {
          id: 'sk_political',
          name: '政治常识',
          type: 'subknowledge',
          content: '政治理论、方针政策、时事政治等方面的知识。',
          children: [
            {
              id: 'sk_theory',
              name: '政治理论',
              type: 'angle',
              content: '马克思主义基本原理、毛泽东思想、中国特色社会主义理论体系等。',
              children: [
                {
                  id: 'sk_marx',
                  name: '马克思主义基本原理',
                  type: 'angle',
                  content: '马克思主义哲学、政治经济学、科学社会主义。',
                  children: [
                    { id: 'a_marx_philosophy', name: '哲学', type: 'angle', content: '唯物论、辩证法、认识论、唯物史观。' },
                    { id: 'a_marx_economics', name: '政治经济学', type: 'angle', content: '商品、货币、剩余价值。' },
                    { id: 'a_marx_socialism', name: '科学社会主义', type: 'angle', content: '科学社会主义理论。' },
                  ],
                },
                {
                  id: 'sk_mao',
                  name: '毛泽东思想和中国特色社会主义理论体系',
                  type: 'angle',
                  content: '毛中特理论体系。',
                  children: [
                    {
                      id: 'sk_mao_thought',
                      name: '毛泽东思想',
                      type: 'angle',
                      content: '毛泽东思想的主要内容。',
                      children: [
                        { id: 'a_mao_form', name: '形成发展', type: 'angle', content: '萌芽、形成、成熟、继续发展。' },
                        { id: 'a_mao_soul', name: '活的灵魂', type: 'angle', content: '实事求是、群众路线、独立自主。' },
                        { id: 'a_mao_revolution', name: '新民主主义革命', type: 'angle', content: '总路线、三大法宝、道路、纲领。' },
                        { id: 'a_mao_build', name: '社会主义改造与建设', type: 'angle', content: '社会主义改造和建设理论。' },
                      ],
                    },
                    { id: 'sk_deng', name: '邓小平理论', type: 'angle', content: '解放思想、实事求是、社会主义本质、初级阶段、改革开放、市场经济。' },
                    { id: 'sk_three', name: '三个代表重要思想', type: 'angle', content: '中国共产党始终代表中国先进生产力的发展要求、先进文化的前进方向、最广大人民的根本利益。' },
                    { id: 'sk_science', name: '科学发展观', type: 'angle', content: '以人为本、全面协调可持续的发展观。' },
                    {
                      id: 'sk_xi',
                      name: '习近平新时代中国特色社会主义思想',
                      type: 'angle',
                      content: '新时代中国特色社会主义的指导思想。',
                      children: [
                        { id: 'a_xi_core', name: '创立背景与核心要义', type: 'angle', content: '创立背景和核心内容。' },
                        { id: 'a_xi_system', name: '核心内容体系', type: 'angle', content: '十个明确、十四个坚持、十三个方面成就。' },
                        { id: 'a_xi_method', name: '世界观和方法论', type: 'angle', content: '六个必须坚持。' },
                        { id: 'a_xi_modern', name: '中国式现代化', type: 'angle', content: '中国式现代化的内涵和特征。' },
                        { id: 'a_xi_development', name: '新发展理念与新发展格局', type: 'angle', content: '创新、协调、绿色、开放、共享的发展理念。' },
                        { id: 'a_xi_strategy', name: '重大战略部署', type: 'angle', content: '各项重大战略。' },
                      ],
                    },
                  ],
                },
              ],
            },
            { id: 'sk_innovation', name: '党的创新理论', type: 'angle', content: '党的最新理论成果。' },
            { id: 'sk_policy', name: '党和国家方针政策', type: 'angle', content: '当前的方针政策。' },
            { id: 'sk_current', name: '时政热点', type: 'angle', content: '近期的时事政治热点。' },
            {
              id: 'sk_party',
              name: '党的基本知识',
              type: 'angle',
              content: '党的性质、宗旨、组织原则等基本常识。',
              children: [
                { id: 'a_party_nature', name: '党的性质、宗旨、指导思想', type: 'angle', content: '党的根本属性和指导思想。' },
                { id: 'a_party_mission', name: '党的初心使命、伟大建党精神', type: 'angle', content: '党的初心和使命。' },
                { id: 'a_party_organize', name: '党的组织原则', type: 'angle', content: '民主集中制。' },
                { id: 'a_party_system', name: '党的组织体系', type: 'angle', content: '中央组织、地方组织、基层组织。' },
                { id: 'a_party_member', name: '党员', type: 'angle', content: '义务、权利、入党条件。' },
                { id: 'a_party_rules', name: '党的制度', type: 'angle', content: '代表大会制、选举制、任期制。' },
                { id: 'a_party_discipline', name: '党的纪律', type: 'angle', content: '六大纪律、处分种类。' },
                { id: 'a_party_practice', name: '全面从严治党', type: 'angle', content: '党风廉政建设、反腐败。' },
                { id: 'a_party_meeting', name: '党的重要会议', type: 'angle', content: '一大到二十大核心内容。' },
                { id: 'a_party_history', name: '党史脉络', type: 'angle', content: '新民主主义革命、社会主义革命、改革开放、新时代。' },
                { id: 'a_party_concepts', name: '重要概念', type: 'angle', content: '五位一体、四个全面、四个意识、四个自信、两个维护。' },
              ],
            },
            { id: 'sk_history', name: '中共党史', type: 'angle', content: '中国共产党的历史发展。' },
            { id: 'sk_special', name: '时政专题', type: 'angle', content: '重要时事专题。' },
          ],
        },
        {
          id: 'sk_law',
          name: '法律常识',
          type: 'subknowledge',
          content: '宪法、民法、刑法、行政法等法律知识。',
          children: [
            { id: 'a_law_constitution', name: '宪法', type: 'angle', content: '国家根本大法。' },
            { id: 'a_law_civil', name: '民法典', type: 'angle', content: '民事法律规范的总和。' },
            { id: 'a_law_criminal', name: '刑法', type: 'angle', content: '规定犯罪和刑罚的法律。' },
            { id: 'a_law_admin', name: '行政法', type: 'angle', content: '调整行政关系的法律规范。' },
            { id: 'a_law_civil_service', name: '公务员法', type: 'angle', content: '公务员管理的法律规范。' },
            { id: 'a_law_new', name: '新法速递', type: 'angle', content: '最新颁布的法律法规。' },
          ],
        },
        {
          id: 'sk_economics',
          name: '经济常识',
          type: 'subknowledge',
          content: '微观经济、宏观经济、市场经济等经济知识。',
          children: [
            { id: 'a_econ_micro', name: '微观经济', type: 'angle', content: '个体经济行为和市场机制。' },
            { id: 'a_econ_macro', name: '宏观经济', type: 'angle', content: '国民经济总体运行和调控。' },
            { id: 'a_econ_market', name: '市场经济', type: 'angle', content: '市场经济体制和运行规律。' },
            { id: 'a_econ_international', name: '国际经济', type: 'angle', content: '国际经济关系和贸易。' },
          ],
        },
        {
          id: 'sk_humanities',
          name: '人文历史',
          type: 'subknowledge',
          content: '历史、文学、文化等人文知识。',
          children: [
            { id: 'a_history_china', name: '中国历史', type: 'angle', content: '古代、近代、现代中国历史。' },
            { id: 'a_history_world', name: '世界历史', type: 'angle', content: '世界历史发展脉络。' },
            { id: 'a_literature', name: '文学常识', type: 'angle', content: '先秦、秦汉、唐宋、明清、现当代文学。' },
            { id: 'a_culture', name: '文化常识', type: 'angle', content: '诸子百家、传统节日、礼仪、科技。' },
          ],
        },
        {
          id: 'sk_science',
          name: '科技地理',
          type: 'subknowledge',
          content: '科技成就、地理知识等。',
          children: [
            { id: 'a_science_achieve', name: '科技成就', type: 'angle', content: '中国、世界科技成就。' },
            { id: 'a_science_basic', name: '基础科学', type: 'angle', content: '物理、化学、生物基础知识。' },
            { id: 'a_science_life', name: '生活常识', type: 'angle', content: '日常生活中的科学知识。' },
            { id: 'a_geo_china', name: '中国地理', type: 'angle', content: '中国地理概况。' },
            { id: 'a_geo_world', name: '世界地理', type: 'angle', content: '世界地理概况。' },
          ],
        },
        {
          id: 'sk_admin',
          name: '管理公文',
          type: 'subknowledge',
          content: '行政管理和公文写作知识。',
          children: [
            { id: 'a_admin_manage', name: '行政管理', type: 'angle', content: '行政管理基本知识。' },
            { id: 'a_admin_document', name: '公文格式与文种', type: 'angle', content: '公文的格式和种类。' },
          ],
        },
      ],
    },
  ],
};

function flattenTree(node: any, parentId: string | null = null): any[] {
  const nodes = [{
    id: node.id,
    name: node.name,
    parent_id: parentId,
    pos_x: 0,
    pos_y: 0,
    ps_score: 50,
    node_type: node.type,
    content: node.content || null,
    annotation: node.annotation || null,
  }];

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      nodes.push(...flattenTree(child, node.id));
    }
  }

  return nodes;
}

export async function POST() {
  try {
    const userId = 'default_user';
    const nodes = flattenTree(KNOWLEDGE_TREE);

    for (const node of nodes) {
      await upsertKnowledgeNode(userId, node);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully inserted ${nodes.length} knowledge nodes`,
      count: nodes.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Insert knowledge tree error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
