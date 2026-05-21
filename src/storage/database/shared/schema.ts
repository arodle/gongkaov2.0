import { pgTable, serial, varchar, text, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// 系统表 - 保留不要删除
export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 思维导图表
export const mindMaps = pgTable(
	"mind_maps",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		user_id: varchar("user_id", { length: 36 }).notNull().default(sql`auth.uid()`),
		name: varchar("name", { length: 200 }).notNull().default("我的思维导图"),
		data: jsonb("data").notNull(), // 完整的KnowledgeNode树结构
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(table) => [
		index("mind_maps_user_id_idx").on(table.user_id),
	]
);

// 题库表
export const questionBank = pgTable(
	"question_bank",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		user_id: varchar("user_id", { length: 36 }).notNull().default(sql`auth.uid()`),
		question_text: text("question_text").notNull(),
		option_a: text("option_a"),
		option_b: text("option_b"),
		option_c: text("option_c"),
		option_d: text("option_d"),
		correct_answer: varchar("correct_answer", { length: 10 }).notNull(),
		explanation: text("explanation"),
		knowledge_path: varchar("knowledge_path", { length: 500 }), // 如"行测/言语理解与表达/逻辑填空/实词辨析"
		linked_angle_id: varchar("linked_angle_id", { length: 100 }), // 关联的思维导图角度节点ID
		source: varchar("source", { length: 50 }).notNull().default("manual"), // manual/json/csv/mindmap/practice/exam
		mind_map_id: varchar("mind_map_id", { length: 36 }), // 关联的思维导图ID
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("question_bank_user_id_idx").on(table.user_id),
		index("question_bank_knowledge_path_idx").on(table.knowledge_path),
		index("question_bank_linked_angle_id_idx").on(table.linked_angle_id),
		index("question_bank_source_idx").on(table.source),
	]
);

// 做题记录表
export const answerRecords = pgTable(
	"answer_records",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		user_id: varchar("user_id", { length: 36 }).notNull().default(sql`auth.uid()`),
		question_id: varchar("question_id", { length: 36 }).notNull(),
		selected_answer: varchar("selected_answer", { length: 10 }),
		is_correct: boolean("is_correct").notNull(),
		practice_mode: varchar("practice_mode", { length: 20 }).notNull().default("single"), // single/exam
		practice_set_id: varchar("practice_set_id", { length: 36 }), // 关联的练习集/套卷ID
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("answer_records_user_id_idx").on(table.user_id),
		index("answer_records_question_id_idx").on(table.question_id),
		index("answer_records_practice_set_id_idx").on(table.practice_set_id),
		index("answer_records_created_at_idx").on(table.created_at),
	]
);

// 套卷/练习集表
export const practiceSets = pgTable(
	"practice_sets",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		user_id: varchar("user_id", { length: 36 }).notNull().default(sql`auth.uid()`),
		name: varchar("name", { length: 200 }).notNull(),
		description: text("description"),
		question_ids: jsonb("question_ids").notNull().default(sql`'[]'::jsonb`), // 题目ID数组
		mode: varchar("mode", { length: 20 }).notNull().default("exam"), // exam/practice
		time_limit: integer("time_limit"), // 秒
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("practice_sets_user_id_idx").on(table.user_id),
		index("practice_sets_mode_idx").on(table.mode),
	]
);
