# 中转模型选择与手动输入

## Scope

- Surface: 编辑模型供应商对话框中的“默认模型”字段。
- Evidence: `src/renderer/index.html` renders a required text input with a hidden native `datalist`; `src/renderer/app.js` already calls `provider:probe-models` and stores `state.probedProviderModels`, but the result is only exposed through browser autocomplete.
- User goal: users can enter the exact model ID themselves, while providers that expose `/models` offer a visible selectable list.

## Design language

- Reuse the existing connection form labels, `text-button` model probe action, `form-note`, `provider-error`, and native `select`/`input` controls.
- Keep one accent action per view and avoid a new modal or card.
- Preserve the current required model contract and all provider/API behavior.

## Implementation contract

1. Rename the field label to make it explicit that the value is a model ID and can be entered manually.
2. Add a visible model selector that appears when discovered models exist. Selecting an option writes to the existing `model` input.
3. Keep the text input as the source of truth so custom/private model IDs remain valid even when `/models` is unavailable.
4. Announce probe success and failure beside the probe control; associate the helper text with the input for assistive technology.
5. Preserve `discoveredModels` in add/update payloads and provider persistence.

## Verification

- Unit/API tests continue to cover `/models` parsing and provider persistence.
- Isolated Vue test covers manual model entry, visible discovered-model selection, and no-layout-overflow in the connection dialog.
