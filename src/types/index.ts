export type NodeType = 'subject' | 'knowledge' | 'subknowledge' | 'angle' | 'example';

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

export interface PracticeRecord {
  id: string;
  user_id: string;
  question_id: string;
  is_correct: boolean;
  answer_time: number;
  source_node_ids: string[];
  updated_at: string;
}

export interface PSHistoryRecord {
  id: string;
  node_id: string;
  ps_score: number;
  recorded_at: string;
  user_id: string;
}

export interface Snapshot {
  id: string;
  created_at: string;
  data: string;
}

export interface BackupConfig {
  id: string;
  server_url: string | null;
  last_sync_at: string | null;
  auto_sync_enabled: boolean;
}

export interface Question {
  id: string;
  content: string;
  options: QuestionOption[];
  correctAnswer: string;
  explanation: string;
  images?: string[];
}

export interface QuestionOption {
  label: string;
  text: string;
}

export interface QuestionBankItem {
  id: string;
  content: string;
  options: QuestionOption[];
  correctAnswer: string;
  explanation: string;
  images?: string[];
  linkedAngleId: string;
  linkedAngleName?: string;
  knowledgePath?: string;
  source?: string;
  type?: 'real' | 'simulated';
  questionType?: string;
  reference?: string;
  examPaper?: string;
  createdAt: string;
}

export interface AnswerRecord {
  questionId: string;
  practiceSetId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  timestamp: number;
  linkedAngleId?: string;
  source?: string;
}

export type BehaviorEventType =
  | 'highlight'
  | 'circle'
  | 'strike'
  | 'answer_select'
  | 'answer_change'
  | 'note';

export interface BehaviorEventRecord {
  id?: string;
  schemaVersion?: number;
  questionId: string;
  userId: string;
  eventType: BehaviorEventType;
  target: string;
  startTime: string;
  endTime: string;
  metadata: Record<string, unknown>;
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

export interface ExamPaper {
  id: string;
  name: string;
  description: string;
  type: 'real' | 'simulated';
  questions: string[];
  questionCount?: number;
  createdAt: string;
  completedCount: number;
  avgScore: number;
}

export interface SimulatedPaperConfig {
  id: string;
  name: string;
  region?: string;
  position?: string;
  subjectWeights: Record<string, number>;
  createdAt: string;
}

export type AppTab = 'mindmap' | 'practice' | 'exam' | 'bank' | 'wrongbook' | 'report' | 'center' | 'manual';

export interface PSColorConfig {
  background: string;
  border: string;
  text: string;
  pulse: boolean;
  opacity: number;
}

export interface GraphNode {
  id: string;
  data: KnowledgeNodeRecord;
  children?: GraphNode[];
  questions?: Question[];
}

export type PracticeMode = 'sequence' | 'random' | 'targeted' | 'exam';

export interface MindMapRecord {
  id: string;
  name: string;
  description?: string;
  category?: string;
  root_node_id?: string;
  settings?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MapNodeRecord {
  id: string;
  mind_map_id: string;
  user_id?: string;
  parent_id: string | null;
  name: string;
  content?: string;
  markdown?: string;
  node_type: string;
  color_tag: string;
  ps_score?: number;
  last_practiced_at?: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  expanded: boolean;
  created_at: string;
  updated_at: string;
}

export interface MapEdgeRecord {
  id: string;
  mind_map_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  created_at: string;
}

export type MindTabType = 'mindmap' | 'mindcanvas' | 'mindeditor';
