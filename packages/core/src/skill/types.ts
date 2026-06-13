import { Schema } from "effect"

export const SkillInfo = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  content: Schema.String,
  hidden: Schema.optional(Schema.Boolean),
})
export type SkillInfo = typeof SkillInfo.Type

export interface SkillFrontmatter {
  readonly name?: string
  readonly description?: string
  readonly hidden?: boolean
  readonly allowedTools?: readonly string[]
  readonly model?: string
  readonly paths?: readonly string[]
}
