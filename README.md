# 部品交換履歷 V4.0 — GitHub Pages + Google Apps Script + Google Sheets / Drive

## V4.0 新增：放置地點
- 新增交換紀錄與修改紀錄均可填寫「放置地點」（選填，最多 200 字）。
- 交換履歷顯示放置地點；Google Sheets 的 **N 欄**新增「放置地點」，M 欄圖片縮圖維持不變。
- 升級既有 V3 時只需更新 `index.html`、`app.js`、`Code.gs`（其他檔可保留），在 Apps Script 執行一次 `setup()`，然後 **建立新的網頁應用程式部署版本**。
- 原有資料的 N 欄保持空白，編輯歷史資料後填入地點即可；不需重新匯入歷史 CSV，也不要覆蓋 Records 表。

## 功能
- 新增、查詢、現有紀錄修改（以 Record ID 識別），手動輸入操作員。
- 手機拍照或選擇照片，上傳前在瀏覽器縮圖壓縮到 JPG（最長邊 1600px，約 3 MB 以內）。
- 照片實際儲存在 Google Drive 指定資料夾。Sheet 包含「照片連結」、「照片檔案ID」、「照片預覽」欄；預覽欄 M 會**直接顯示私人 Drive 照片的縮圖**（以圖片物件錨定在 M 欄儲存格上方，不是 `=IMAGE()` 公式）。不會將相片公開發佈。
- Google Sheet 同步、月別統計，修改時使用版本比對避免覆寫他人修改。

## 1. 建立 Google Sheets / Drive
1. 在 Google Drive 建一個專用資料夾「部品交換照片」，複製資料夾網址 `/folders/` 後方的 ID。
2. 新建 Google 試算表。記下網址 `/d/` 與 `/edit` 之間的 ID。
3. 在 Google Sheets →「擴充功能」→「Apps Script」，將 `Code.gs` 完整貼入。
4. Apps Script「專案設定」→「指令碼屬性」新增 `SPREADSHEET_ID` 和 `PHOTO_FOLDER_ID`。如需 PIN，可再設 `ACCESS_PIN`。
5. 在 Apps Script 編輯器執行 `setup()` 並授權 Sheets / Drive；Records 表將新增欄位。既有舊版 Records 資料會保留，擴充 I～N 欄。
6. **V2 升級者**：先執行 `rebuildThumbnails()`，讓已經有照片檔案 ID 的舊紀錄也在 M 欄顯示縮圖。首次匯入沒有照片的紀錄可不執行。
7. 部署 → 新增部署作業 → 網頁應用程式 →「執行身分：我」。存取權限應遵循公司規定。取得 `/exec` 網址。
8. 在 `config.js` 的 `API_URL` 貼上 `/exec` 完整網址。
9. 把 `index.html`、`style.css`、`app.js`、`config.js` 上傳至 GitHub Repository，啟用 Settings → Pages，選 main / root。使用 GitHub Pages 的 HTTPS 網址。
10. 用手機新增一筆帶照片的測試紀錄，確認 Sheet M 欄直接顯示照片縮圖、I 欄有私人連結並可用授權帳號開啟；從履歷點修改，再確認 Sheets 的版本、照片連結和資料更新。

## 2. 歷史紀錄
`歷史資料匯入.csv` 是舊版 8 欄格式，可用 Google Sheets 匯入 Records（必須保留現有表頭，從第 2 列貼入 8 欄）。I～N 留白，後續修改將自動補上版本 / 照片資訊。**不要再次匯入已存在的資料，避免重複。**

## 3. 安全與限制
- GitHub Pages 是公開的靜態網站，`config.js` 的內容人人可見，請**勿將帳密、API secret、Drive 金鑰存進 GitHub**。
- Apps Script 設定「任何人」可存取時，端點可被網際網路使用者呼叫；前端輸入 PIN 只能做簡易限制，PIN 經 URL 參數傳遞，**不等同個別帳號登入或企業級身分驗證**。涉及公司內部敏感設備/照片，需事先取得 IT 審核，優先採組織限制、身分驗證代理或核准的內網方案。
- Drive 照片預設不設定 `ANYONE_WITH_LINK`，只有**有該照片檔案權限的帳號**能開啟照片；不保證每位操作員自動有權限。照片檔案不會公開。
- **注意真正的「儲存格內圖片」與本方案差異：** Apps Script 目前無法保證把私人 Drive blob 以原生 CellImage 方式寫入儲存格；V3 使用 `sheet.insertImage(blob, 13, row, 5, 5)` 加入圖片物件並錨定在 M 欄，圖片對齊儲存格並調高該列（118px），開啟試算表可直接看到縮圖，且無需公開圖片網址。**請勿直接在試算表排序、移動或刪除 Records 資料列**，否則圖片與紀錄可能錯位；請用網頁篩選查看。正式需要原生「儲存格內」圖片且完全不允許浮動圖時，需要另外選用受權限保護的圖片提供服務並驗證 Google Sheets 的相容性。
- Apps Script `POST` 在跨來源 GitHub Pages 使用 `no-cors`，瀏覽器無法直接看 HTTP 錯誤訊息。前端改用 GET 比對紀錄 ID / 版本確認寫入；如果未確認成功，應先查表，不要立即重送。正式多人使用應評估同時編輯權限和稽核記錄。
- 不會自動刪除舊圖片，圖片更換後歷史檔案仍留在 Drive 供管理員整理。

## 限制與備份
- M 欄影像為錨定圖（浮動圖物件），不是原生儲存格值；匯出成 CSV 不會包含縮圖。Google Drive 的照片檔案 ID 與原圖仍保留於 J 欄及指定資料夾。
- Google Sheets 文件分享權限應限公司核准帳號；圖片不設定公開分享。Sheet 的查看者能看到已嵌在表格上的縮圖，請嚴格管理試算表存取權。
- 修改紀錄並更換照片會更新 M 欄縮圖；若已上傳圖片的 V2 舊資料，用 `rebuildThumbnails()` 重建。大量照片會增加 Google Sheets 檔案大小及開啟時間，建議定期封存年度紀錄。
- 不應把 `ACCESS_PIN` 當成企業登入機制；公開部署的 Apps Script / GitHub Pages 方案，應先與公司 IT 確認適用於內部資料的身分驗證架構。


## 完整原始碼易讀版
所有程式碼皆為可直接編輯的文字檔；HTML/CSS/JavaScript/Apps Script 已改為實際換行、縮排，方便在 VS Code 閱讀、修改及 Git 版控。
