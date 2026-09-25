# 剧情结算写入契约

## 剧情结算字段

- `touma.affection`：冬马和纱对春希的好感度，结果范围为 0～100。只能用 `state.inc` 写入本轮增量；只有特殊互动才变化，单轮增减不超过 5。
- `setsuna.affection`：小木曾雪菜对春希的好感度，结果范围为 0～100。只能用 `state.inc` 写入本轮增量；只有特殊互动才变化，单轮增减不超过 5。
- `performance.proficiency`：学园祭演出熟练度，结果范围为 0～100。只能用 `state.inc` 写入本轮增量；只有实际发生足以影响演出状态的演出练习、磨合、失误或状态波动时才变化，单轮增减不超过 5。
- `timeline.currentTime`：本轮正文结束时的剧情时间，格式必须为 `YYYY.MM.DD: HH:mm 星期X`，且不得晚于当前的 `timeline.currentSlotEnd`。
