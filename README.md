# 旅途筆記：GitHub Pages 版本

GitHub Pages 提供網站畫面；Supabase 免費資料庫儲存親友共用的行程。GitHub Pages 本身只提供靜態網站，無法直接執行原先的 D1/Worker 儲存程式。

## 1. 建立 Supabase 資料庫

1. 在 [Supabase](https://supabase.com/) 建立專案。
2. 開啟專案的 **SQL Editor**，貼上並執行 `supabase/schema.sql` 的全部內容。
3. 從專案的 **Connect** 視窗複製 **Project URL** 與 **publishable key**（開頭為 `sb_publishable_`）。
4. 打開 `docs/config.js`，把這兩個值填進 `url` 和 `publishableKey`。不要填入 secret 或 service-role key。

`schema.sql` 將資料表放在不公開的資料庫結構中，只開放建立、讀取、更新行程的限定功能。行程內容需要完整連結中的編輯憑證才能讀取或修改。

## 2. 發布至 GitHub Pages

1. 在 GitHub 建立一個**公開儲存庫**，把此資料夾中的 `docs/`、`supabase/`、`README.md` 上傳到儲存庫根目錄。
2. 開啟儲存庫的 **Settings → Pages**。
3. 將 **Source** 選為 **Deploy from a branch**，分支選 `main`，資料夾選 `/docs`，儲存。
4. 發布完成後，GitHub 會提供 `https://你的帳號.github.io/儲存庫名稱/` 網址。打開它，建立行程並按「分享行程」。

網站使用相對路徑，因此放在 GitHub Pages 的專案子目錄也能正確載入圖片、樣式和程式。儲存庫中的 `docs/config.js` 只包含可公開的 publishable key；不要把 Supabase 的 secret key 放進 GitHub。

## 共用與限制

- **拿到完整分享連結的人都能查看和編輯**該行程。請只分享給信任的親友；此版本沒有個別帳號或唯讀權限。
- 網址的 `#key=...` 是編輯憑證。複製連結時要保留這段；它不會隨 GitHub Pages 的網頁請求送到 GitHub 伺服器。
- 如兩人同時修改同一版行程，後儲存的人會看到衝突提示，須重新整理並合併內容。
- Supabase 免費專案可能因長時間不使用而暫停。需要時可到 Supabase 控制台恢復。
- 先前本機預覽中的示範行程不會自動移入新的 Supabase 資料庫。
