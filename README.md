# app-itonami-kabi — Kabi

カビ — 菌糸のネットワーク層です。agent 同士を結ぶ菌糸（hypha）を伸ばし・刈り込み、菌糸融合の相性（VCG）を確かめ、活きている菌糸の容量から最大の養分の流れを計算します。

Tauri **3.0.0-alpha.6** の独立 app（`tauri-runtime-wry`、OS の WebView）と、同じファイルの static Web ビルドです。記録はすべてこの端末の中（localStorage、key `itonami.kabi.v1`）に保存し、外部へは通信しません。外部操作の宣言もありません（`dist/descriptor.json` の `operations: []`）。保存に失敗したときは画面に表示します。

## できること

| 操作 | 内容 |
| --- | --- |
| 菌糸を伸ばす (extendHypha) | from から to への一方向の菌糸。容量は正の整数です。 |
| 菌糸を刈る (pruneHypha) | — |
| 融合を試す (fusionProbe) | 2 つの先端の VCG（栄養体和合性群）が同じときだけ融合します。 |
| ネットワークを見る (getNetwork) | — |
| 養分の流れ (getNutrientFlow) | 活きている菌糸の容量だけを使った、source から sink への最大流（Edmonds–Karp）です。 |

記録（collection）: `cloud.itonami.apps.kabi.fusionProbe`、`cloud.itonami.apps.kabi.hypha`

## 補足

- **この domain は新しく設計したものです。** 旧 Worker は処理を外部の AgentGateway / LangServer に転送していて、処理の中身はこの repository にありませんでした。旧 Worker の method 名・README・BPMN をもとに、この端末だけで動く domain を作りました。旧サービスと同じ挙動である保証はありません。
- 菌糸は from → to の一方向です。養分の流れは、活きている菌糸の容量だけを使った最大流（Edmonds–Karp）です。
- 旧 `cljs/`（UI）は残しています。この app のビルド・テストでは使いません。

## 構成

| パス | 役割 |
| --- | --- |
| `src/domain/` | domain logic（TypeScript）。ビルド時に Node の type stripping で JS にします（bundler・依存なし） |
| `src/local-store.js` | この端末内の record store。domain が使う `read` / `write` を localStorage で実装 |
| `src/app-def.js` | 画面の操作と domain 関数・collection の対応 |
| `src/ui/` | 依存なしの UI。DOM はテキストノードだけで組み、HTML 文字列を使いません（CSP `style-src 'self'`） |
| `vendor/` | kotoba-lang/kotoba の `kotoba-client-runtime.js` / consent CSS と `PINS.json`。`scripts/build.mjs` が digest のずれで失敗します |
| `src-tauri/` | Tauri v3 host。read-only command は `awai_host_info` の 1 つだけ。filesystem・network・shell・installer 権限なし |
| `cljs/` | 旧 ClojureScript UI（amu でビルド）。この app のビルド・テストでは使いません |

## コマンド

```sh
npm ci
npm test              # build してから domain と local-only のテスト（kabi.test.ts, local-only.test.mjs）
npm run build         # dist/ と SHA-256 の release.json
npm run build:desktop # native desktop 実行ファイル（bundle・署名なし）
```

## 状態と制限（AWAI-3079, 2026-11-17）

- 旧構成（Cloudflare Worker の XRPC dispatcher / adapter、`wrangler.jsonc`、`@etzhayyim/sdk`）は削除しました。履歴は git にあります。
- 検証済み: `npm test`、`npm run build`、`cargo check`（Tauri 3.0.0-alpha.6）。
- 未検証: native window の起動、`tauri build`、Android、署名、配布。アイコンは app-soshiki の仮アイコンです。
