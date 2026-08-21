# 中转模型读取与选择

## Scope

- Surface: 编辑模型供应商对话框中的“默认模型”字段。
- Evidence: `src/renderer/index.html` renders the required model control in the relay form; `src/renderer/app.js` calls `provider:probe-models` and stores `state.probedProviderModels`.
- User goal: users must select a model returned by the relay; the connection must not accept an unverified, hand-typed model ID.

## Design language

- Reuse the existing connection form labels, `text-button` model probe action, `form-note`, `provider-error`, and native `select`/`input` controls.
- Keep one accent action per view and avoid a new modal or card.
- Preserve the current required model contract and all provider/API behavior.

## Implementation contract

1. Replace the free-text model field with a required native select that is disabled until discovery succeeds.
2. Populate the select only from `state.probedProviderModels` or a previously saved provider catalog.
3. Reject add/update when no discovered model is selected; preset model strings must never bypass discovery.
4. Announce probe success and failure beside the probe control; associate the helper text with the select for assistive technology.
5. Preserve `discoveredModels` in add/update payloads and provider persistence.

## Verification

- Unit/API tests continue to cover `/models` parsing and provider persistence.
- Isolated Vue test covers manual model entry, visible discovered-model selection, and no-layout-overflow in the connection dialog.
