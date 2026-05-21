export type NodeType = 'subject' | 'knowledge' | 'subknowledge' | 'angle';

/** 数据库中存储的知识节点记录 */
export interface KnowledgeNodeRecord {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  pos_x: number;
  pos_y: number;
  ps_score: number;
  last_practiced_at: string | null;
  color_tag: string;
  node_type: NodeType;
  content?: string;
  annotation?: string;
  updated_at: string;
}

export interface KnowledgeNode {
  id: string;
  name: string;
  type: NodeType;
  children: KnowledgeNode[];
  questions: Question[];
  /** 知识点内容描述 */
  content?: string;
  /** 注释/备注 */
  annotation?: string;
  /** 图片URL列表 */
  images?: string[];
}

export interface Question {
  id: string;
  content: string;
  options: QuestionOption[];
  correctAnswer: string;
  explanation: string;
  /** 解析图片URL列表 */
  images?: string[];
}

export interface QuestionOption {
  label: string;
  text: string;
}

/** 题库中的题目条目 - 所有题目统一存储 */
export interface QuestionBankItem {
  id: string;
  content: string;
  options: QuestionOption[];
  correctAnswer: string;
  explanation: string;
  /** 解析图片URL列表 */
  images?: string[];
  /** 关联的出题角度ID */
  linkedAngleId: string;
  /** 关联的出题角度名称 */
  linkedAngleName: string;
  /** 知识点路径，如 "行测》言语理解与表达》片段阅读》主旨概括题" */
  knowledgePath: string;
  /** 来源：mindmap-inline / practice / exam / upload */
  source: string;
  /** 题目出处：人民日报、新华社等 */
  reference?: string;
  /** 创建时间 */
  createdAt: string;
}

export interface PracticeSet {
  id: string;
  name: string;
  questions: PracticeQuestion[];
  createdAt: string;
}

export interface PracticeQuestion {
  id: string;
  content: string;
  options: QuestionOption[];
  correctAnswer: string;
  explanation: string;
  /** 解析图片URL列表 */
  images?: string[];
  linkedAngleId: string;
  linkedAngleName: string;
}

export interface AnswerRecord {
  questionId: string;
  practiceSetId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  timestamp: number;
  /** 关联的出题角度ID，用于思维导图错题累积标记 */
  linkedAngleId?: string;
  /** 来源：mindmap / practice / exam */
  source?: string;
}

export interface ExamResult {
  id: string;
  practiceSetId: string;
  answers: Record<string, string>;
  score: number;
  totalQuestions: number;
  completedAt: string;
  wrongQuestionIds: string[];
}

export type AppTab = 'mindmap' | 'practice' | 'bank' | 'wrongbook' | 'report' | 'center';
