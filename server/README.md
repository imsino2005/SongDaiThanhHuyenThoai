# Survivors Backend API

REST API for Vampire Survivors clone with Azure SQL Database, Azure Blob Storage, JWT auth, leaderboard, cloud save, shop, and achievements.

## Setup

1. Copy `.env.example` to `.env` and configure your Azure values.
2. Run:
   ```bash
   cd server
   npm install
   ```
3. Run migrations:
   ```bash
   npx sequelize-cli db:migrate
   ```
4. Start server:
   ```bash
   npm run dev
   ```

## API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/profile`
- `PATCH /api/profile`
- `POST /api/cloud-saves`
- `GET /api/cloud-saves`
- `GET /api/leaderboard`
- `POST /api/leaderboard`
- `GET /api/shop/catalog`
- `GET /api/shop/inventory`
- `POST /api/shop/purchase`
- `GET /api/achievements`
- `POST /api/achievements/unlock`

## Notes

- Protected routes require `Authorization: Bearer <token>`.
- Uses Application Insights when `APPINSIGHTS_INSTRUMENTATIONKEY` is set.

## Azure Blob Storage

1. Tạo Storage Account trong cùng subscription.
2. Vào `Storage accounts` → chọn storage account.
3. Chọn `Containers` → `+ Container` và tạo container tên `cloud-saves` (hoặc tên bạn cấu hình trong `.env`).
4. Lấy `Access keys` hoặc `Connection string` trong `Access keys` và copy vào `AZURE_STORAGE_CONNECTION_STRING`.

## Deploy lên Azure App Service

1. Tạo App Service mới:
   - Runtime stack: Node 18 LTS
   - OS: Linux hoặc Windows
   - Region: giống hoặc gần vùng SQL/Storage
2. Trong `Deployment`, kết nối GitHub hoặc ZIP deploy toàn bộ repo gốc.
3. Trong `Configuration` của App Service, thêm biến môi trường:
   - `AZURE_SQL_CONNECTION_STRING`
   - `JWT_SECRET`
   - `JWT_EXPIRES_IN=7d`
   - `AZURE_STORAGE_CONNECTION_STRING`
   - `BLOB_CONTAINER_NAME=cloud-saves`
   - `APPINSIGHTS_INSTRUMENTATIONKEY`
   - `PORT=4000`
4. Trong `General settings`, chọn `Startup Command` = `npm start`.
5. Deploy xong, truy cập URL App Service để chạy game.

## App Service + Static Frontend

- Backend đã cấu hình để phục vụ cả frontend từ gốc repo.
- Khi deploy, App Service sẽ phục vụ `index.html` và các file JS tĩnh.
