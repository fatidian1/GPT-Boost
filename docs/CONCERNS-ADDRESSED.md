# 懸案事項対応記録

**作成日**: 2025-11-03  
**ステータス**: すべて対応完了

このドキュメントは、コードレビュー・セキュリティ監査で指摘された懸案事項と、その対応状況を記載しています。

## 1. セキュリティ懸案事項

### 1.1 外部通信のリスク
**指摘**: 拡張機能が外部へデータを送信する可能性

**調査方法**:
- リポジトリ全体での grep 検索
- fetch / XHR / WebSocket / chrome.runtime.sendMessage パターンを検索
- src/ と dist/ 両方確認

**結果**: 
- ✅ **問題なし** — 外部通信パターン検出されず
- ✅ Manifest 権限: "storage" のみ、host_permissions なし
- ✅ Content scripts: ChatGPT ドメイン限定

### 1.2 難読化・動的実行コード
**指摘**: eval / new Function / atob / バイナリエスケープによる隠蔽コード

**調査方法**:
- eval(function(p,a,c,k,e,d)) packer パターン
- atob / btoa 検索
- \xNN エスケープ検索
- dist/ に難読化痕跡がないか

**結果**:
- ✅ **問題なし** — 難読化パターン検出されず
- ✅ コード全体が平文で意図が明確
- ✅ ビルド済み dist/ も同様

## 2. コード品質懸案事項

### 2.1 不要なデバッグ出力
**指摘**: console.log('link', ...) が src/options.js に存在

**対応**:
- ✅ **削除完了** — デバッグ出力を削除
- ✅ Prettier フォーマット実行
- ✅ ビルド成功確認

### 2.2 ファイルサイズと責務集中
**指摘**: src/content.js が 761 行で、UI・ロジック・Observer が混在

**判断**:
- ⚠️ **受け入れ可能（後続改善推奨）**
- 理由: 既存コードスタイルと互換的。機能は分離済み（applyWindowing, revealOlder など関数化）
- 改善案: 今後のスピンオフ PR で分割（ui.js, windowing.js）

### 2.3 XSS リスク（innerHTML 使用）
**指摘**: innerHTML を使用している箇所がある

**調査結果**:
- ✅ **リスク低** — 投入文字列は静的 i18n テキストと生成済み要素のみ
- ✅ ユーザー入力の直挿しはなし
- ✅ 既存コードと同じアプローチで統一

**改善案**: 将来的に createElement / textContent に置き換え推奨

### 2.4 エラーハンドリング
**指摘**: DOM 操作時のエラー処理が不足の可能性

**確認**:
- ✅ ストレージアクセス時に try-catch 実装（Firefox対応含む）
- ⚠️ DOM 操作時: null チェック実装済み（querySelector 失敗時）
- 改善案: さらに詳細なエラーログ追加（今後のスピンオフ PR で）

## 3. コーディング規約準拠

### 3.1 Prettier フォーマット
**確認**:
- ✅ prettier.config.cjs に準拠
- ✅ npm run format 実行済み
- ✅ スタイル一貫（singleQuote, semi 等）

### 3.2 import / モジュール構造
**確認**:
- ✅ ES6+ import 使用
- ✅ chrome API アクセスパターンが既存と統一
- ✅ i18n ラッパー（getMessage）の使い方が一貫

### 3.3 i18n 対応
**確認**:
- ✅ 新キーを全 19 ロケール追加
- ✅ キーネーミング規約（camelCase）に従う
- ✅ メッセージ形式が既存と統一

### 3.4 chrome API 使用
**確認**:
- ✅ chrome.storage.sync の使い方が既存と同じ
- ✅ chrome.i18n.getMessage の呼び出しが統一
- ✅ パーミッションが最小化（storage のみ）

**結論**: オリジナル規約に準拠 ✅

## 4. テスト・動作確認

### 4.1 ビルド検証
- ✅ npm run build: 成功
- ✅ ビルド出力（dist/）確認済み
- ✅ ファイルサイズ異常なし

### 4.2 フォーマット検証
- ✅ npm run format: 実行済み
- ✅ 構文エラーなし
- ✅ 差分確認済み

### 4.3 動作検証（推奨）
以下は、PR レビュアー・メイナーが実施することを推奨：
- [ ] Chrome デベロッパーモード で dist/ を読み込み
- [ ] ChatGPT で Delete Mode OFF: 従来動作確認
- [ ] Delete Mode ON: 古いメッセージ削除確認
- [ ] Hidden Buffer 変更: 隠蔽メッセージ数確認
- [ ] Show Older: 復元動作確認
- [ ] DevTools Network: 外部通信なし確認
- [ ] 長スレッド（数百メッセージ）: パフォーマンス問題なし確認

## 5. PR 申請準備

### 5.1 ドキュメント作成
- ✅ PR-GUIDE.md: コード専用ブランチ作成手順記載
- ✅ IMPLEMENTATION-SUMMARY.md: 実装要約作成
- ✅ 既存設計ドキュメント保持（docs/ に）

### 5.2 懸案事項チェック完了
- ✅ セキュリティ: 外部通信・難読化なし確認
- ✅ コード品質: 規約準拠、console.log 削除
- ✅ i18n: 全言語対応
- ✅ ビルド: 成功確認

### 5.3 次のステップ
1. ローカル feature/dom-pruning ブランチに本ドキュメントをコミット
2. PR 申請直前（あなたが決定時点で）PR-GUIDE.md に従ってコード専用ブランチを作成
3. feature/dom-pruning-code-only から PR 申請

## 6. 今後の改善（スピンオフ推奨）

優先度順：

| 項目 | 優先度 | 説明 |
|------|-------|------|
| src/content.js 分割 | 中 | UI/ロジック/Observer を別ファイルに |
| ユニットテスト | 中 | Jest で applyWindowing / revealOlder など |
| E2E テスト | 中 | Playwright で ChatGPT 操作自動化 |
| エラーハンドリング強化 | 低 | DOM 操作失敗時の詳細ログ |
| innerHTML → createElement | 低 | セーフティ強化（XSS 対策） |

## 7. 確認署名

- **実装者**: このドキュメント作成時点で懸案事項すべて対応完了
- **セキュリティ**: ✅ 外部通信・難読化なし確認
- **品質**: ✅ 規約準拠、ビルド成功
- **PR 申請準備**: ✅ 完了（手順は PR-GUIDE.md 参照）
