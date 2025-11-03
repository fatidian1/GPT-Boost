# DOM Pruning Feature — PR 申請ガイド

このドキュメントは、DOM Pruning 機能の PR を上流リポジトリに申請する際の手順を記載しています。

## 概要

この機能では、以下を追加しました：
- **DOM削除モード**: 古いメッセージを物理削除してメモリを節約（オプトイン）
- **Hidden Buffer**: 削除前に一定数のメッセージを DOM に保持し、Show Older で復元可能
- **UI/設定パネル**: Delete Mode と Hidden Buffer の設定をオプション画面に追加
- **多言語対応**: i18n キーを全 19 ロケールに追加

## PR 申請直前の準備（推奨フロー）

### ステップ 1: コード専用ブランチの作成

PR には最小限の変更のみを含めることで、レビューワークを減らし、受け入れを容易にします。

**コード関連ファイルのみを含む専用ブランチを作成：**

```powershell
# mainから新規ブランチを作成
git switch -c feature/dom-pruning-code-only main

# feature/dom-pruningからコード関連ファイルのみを取り込む
git checkout feature/dom-pruning -- `
  src/content.js `
  src/options.js `
  src/options.html `
  src/manifest.json `
  assets/locales
```

### ステップ 2: フォーマット・ビルド検証

```powershell
# Prettier で フォーマットを統一
npm run format

# ビルド成功を確認
npm run build
```

### ステップ 3: コミット・PR 作成

```powershell
# コミット
git add -A
git commit -m "feat: DOM pruning with memory optimization

- Add physical message deletion mode (opt-in)
- Implement hidden buffer for Show Older recovery
- Add DOM Pruning settings to options panel
- Add i18n support for 19 locales"

# リモートにプッシュして PR を作成
git push origin feature/dom-pruning-code-only
```

### ステップ 4: PR 本文に下記を記載

```markdown
## 変更内容

- **機能**: 古いメッセージの物理削除オプション + 復元可能な Hidden Buffer
- **セキュリティ**: manifest 権限は最小化（storage のみ）、外部通信なし
- **対応言語**: 19 ロケール全対応

## レビューポイント

### セキュリティ（必須）
- [ ] manifest に不要な権限がない（host_permissions も確認）
- [ ] src/ に fetch/XHR/WebSocket/eval/new Function 等が無い
- [ ] Delete Mode は opt-in で、UI に不可逆性の警告がある

### 動作確認（推奨）
- [ ] hiddenDomBuffer の境界値テスト（0, 1, 大きな値）
- [ ] Delete Mode OFF/ON での切替動作
- [ ] 長い会話（数百メッセージ）でのパフォーマンス
- [ ] DevTools Network タブで外部通信が無いことを確認

### コード品質
- [ ] i18n キーが全ロケールに追加済み
- [ ] npm run format で フォーマット検証済み
- [ ] npm run build が成功

## テスト環境

Chrome / Edge (Manifest v3)
```

## 並行作業（オリジナルブランチは そのまま）

- `feature/dom-pruning` ブランチはドキュメント・設定を含む完全版として **ローカルに保持**
- PR は `feature/dom-pruning-code-only` で申請
- PR がマージされた後、必要に応じて分割・リファクタをスピンオフで実施（テスト追加、ファイル分割など）

## よくある質問

**Q: ドキュメント（docs/）は PR に含める？**  
A: いいえ。コード専用ブランチを使うため、PR には含まれません。ドキュメントはあなたの fork に保持されます。

**Q: バージョン更新は？**  
A: マージ後、リポジトリメイナーが package.json と manifest.json のバージョンを更新します（こちらで提案可）。

**Q: テストは必須？**  
A: ユニットテストは無いため、PR に「手動テスト手順」を記載し、レビュアーが Chrome デベロッパーモードで動作確認できるようにします。

**Q: Delete Mode は本当に不可逆？**  
A: はい。ページをリロードするまでは Show Older で復元可能ですが、ページをリロードすると、削除されたメッセージはサーバー取得に頼るしかありません（これが仕様）。

## チェックリスト（PR作成前）

- [ ] `feature/dom-pruning-code-only` ブランチを作成済み
- [ ] npm run format → npm run build が成功
- [ ] Git log で コミットメッセージが分かりやすい
- [ ] PR 本文に変更内容と レビューポイント を記載
- [ ] Origin リポジトリに fork 側のブランチをプッシュ
- [ ] GitHub で PR を作成し、レビュアー / Maintainer を指定
