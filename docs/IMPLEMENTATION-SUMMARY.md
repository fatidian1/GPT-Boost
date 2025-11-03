# DOM Pruning 実装要約

**実装完了日**: 2025-11-03  
**ステータス**: 準備完了、PR 申請待機中

## 概要

古いメッセージを物理削除してメモリ使用量を削減する機能を実装しました。opt-in 設定で既存ユーザーへの影響なし。

## 追加機能

### 1. Delete Mode（削除モード）
- `deleteMessages` 設定で有効化
- 有効時：`hiddenDomBuffer` を超えるメッセージを物理削除
- ページリロードで全履歴復元

### 2. Hidden Buffer（隠蔽バッファ）
- `hiddenDomBuffer` 設定で調整
- 削除前に保持する非表示メッセージ数
- Show Older で復元可能

### 3. UI/オプション拡張
- Options 画面に Delete Mode チェックボックス
- Hidden Buffer 数値入力フィールド
- Delete Mode 有効時のみ表示

### 4. i18n 対応
- 新i18nキー：`labelDeleteMode`, `labelHiddenBuffer`, `deleteModeActive`, `reloadPage`
- 全 19 ロケール対応済み

## 技術詳細

### ファイル変更

| ファイル | 変更内容 |
|---------|--------|
| `src/content.js` | 三層ウィンドウイング（削除/隠蔽/表示） |
| `src/options.js` | Delete Mode / Hidden Buffer UI |
| `src/options.html` | 新フィールド追加 |
| `src/manifest.json` | ver 1.2.0 |
| `assets/locales/*` | 新i18nキー追加 |
| `package.json` | ver 1.2.0 |

### 変更行数
- JS追加：約49行（主にcontent.js）
- i18n追加：複数ロケール同時
- ビルド：成功確認済み

## セキュリティ確認
- ✅ Manifest 権限：storage のみ（外部アクセスなし）
- ✅ 外部通信：検出されず（fetch/XHR/WebSocket なし）
- ✅ 難読化・eval：検出されず
- ✅ コード規約：Prettier / eslint 準拠

## PR 申請方法

**重要**: PR は`feature/dom-pruning-code-only`ブランチから申請してください。

詳細は [PR-GUIDE.md](./PR-GUIDE.md) を参照。

### 簡潔なステップ
```bash
# コード専用ブランチ作成（mainから開始）
git switch -c feature/dom-pruning-code-only main
git checkout feature/dom-pruning -- src/ assets/locales

# フォーマット・ビルド
npm run format
npm run build

# コミット・プッシュ
git add -A
git commit -m "feat: DOM pruning with memory optimization"
git push origin feature/dom-pruning-code-only

# GitHub で PR 作成
```

## テスト検証リスト
- [ ] Delete Mode OFF: 従来動作（hide のみ）
- [ ] Delete Mode ON: 古いメッセージ物理削除
- [ ] Hidden Buffer 0: 削除境界直後に削除
- [ ] Hidden Buffer > 0: N個の隠蔽メッセージ保持
- [ ] Show Older: バッファ内のメッセージ復元
- [ ] Reload: 全履歴復元
- [ ] DevTools Network: 外部通信なし
- [ ] 長スレッド（数百メッセージ）: パフォーマンス問題なし

## 今後の改善（スピンオフPR推奨）
- `src/content.js` の分割（UI、ロジック、Observer）
- ユニットテスト追加（Jest）
- E2E テスト追加（Playwright）
- CSP 明示化（manifest.json）

## 参考リソース
- [設計詳細](./dom-pruning-plan.md)
- [テスト手順](./testing.md)
- [パフォーマンス計測](./perf-measurement-plan.md)
