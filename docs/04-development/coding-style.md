# Coding Style

## 语言与格式

- TypeScript 5.x，ESM。
- 缩进 2 个空格。
- 单引号字符串。
- 行尾分号。
- 文件 UTF-8。

## 命名

- 文件名小写，短横线分隔：`my-module.ts`。
- 类名 PascalCase。
- 函数/变量 camelCase。
- 常量 SCREAMING_SNAKE_CASE。

## 类型

- 优先显式类型；避免 `any`。
- 复杂对象使用 zod schema 校验后再使用。
- 共享类型放在 `src/types.ts`。

## 错误处理

- 使用可恢复错误对象，不要裸 throw 字符串。
- 错误码放在 `src/errors.ts`。
- 对外工具返回 schema 化结果；错误通过 `error` 字段暴露。

## 日志

- 使用 `ctx.logger`（如可用）。
- 避免 console.log 遗留。

## 文件 I/O

- 使用 `src/atomic.ts` 做原子写。
- 写后 fsync 关键账本。
- 路径处理使用 `src/hub.ts` 的安全函数。

## 测试

- 文件名 `*.test.ts`。
- 测试覆盖正常分支和失败分支。
- 使用临时目录，不要写真实 Hub。
