# 🏪 Warehouse Express - Hệ Thống Quản Lý Kho & Cửa Hàng

## 📋 Mục Lục
- [Giới Thiệu](#giới-thiệu)
- [Công Nghệ Sử Dụng](#công-nghệ-sử-dụng)
- [Cấu Trúc Dự Án](#cấu-trúc-dự-án)
- [Modules Chính](#modules-chính)
- [Tính Năng Chi Tiết](#tính-năng-chi-tiết)
- [API Routes](#api-routes)
- [Database Schema](#database-schema)
- [Cài Đặt & Chạy](#cài-đặt--chạy)

---

## 🎯 Giới Thiệu

**Warehouse Express** là một hệ thống quản lý toàn diện được xây dựng trên Next.js, tích hợp quản lý kho hàng, bán hàng, nhân sự và báo cáo thông minh. Hệ thống hỗ trợ cả web và mobile (Android) thông qua Capacitor.

### Đặc Điểm Nổi Bật
- ✅ Quản lý kho hàng đa cấp (Admin/Store/Warehouse)
- ✅ Hệ thống POS bán hàng tích hợp
- ✅ Quản lý nhân sự & chấm công
- ✅ Báo cáo & phân tích thông minh
- ✅ Hỗ trợ cả web & mobile app
- ✅ Tích hợp máy in bluetooth & barcode scanner

---

## 🛠️ Công Nghệ Sử Dụng

### Core Technologies
- **Framework**: Next.js 16.0.7 (React 19.2.1)
- **Database**: PostgreSQL + Prisma ORM
- **TypeScript**: Full type-safe codebase
- **Styling**: Tailwind CSS 4.1.9
- **Mobile**: Capacitor 7.4.4 (Android support)

### Key Libraries
- **UI Components**: Radix UI, Konsta UI (mobile)
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts 2.15.4
- **Authentication**: JWT (Jose, bcrypt)
- **File Processing**: ExcelJS, XLSX
- **AI Integration**: OpenAI API
- **Maps**: Leaflet, React Leaflet
- **Notifications**: Firebase Admin
- **Scheduling**: Node-cron

### Mobile Features
- 📷 Camera & Barcode Scanner
- 📍 Geolocation
- 🔔 Push Notifications
- 🖨️ Bluetooth Printer Integration
- 📡 Network Detection
- 💾 Local Storage (SQLite)

---

## 📁 Cấu Trúc Dự Án

```
warehouse-express/
├── app/                          # Next.js App Router
│   ├── admin/                    # Module quản trị hệ thống
│   ├── store/                    # Module cửa hàng
│   ├── warehouse/                # Module kho hàng
│   ├── hr/                       # Module nhân sự
│   ├── attendance/               # Module chấm công
│   ├── api/                      # API Routes
│   ├── login/                    # Authentication
│   ├── offline/                  # Offline mode support
│   └── api-doc/                  # API Documentation (Swagger)
│
├── components/                   # React Components
│   ├── admin/                    # Admin components
│   ├── store/                    # Store components
│   ├── warehouse/                # Warehouse components
│   ├── hr/                       # HR components
│   ├── attendance/               # Attendance components
│   ├── mobile/                   # Mobile-specific components
│   ├── pos/                      # Point of Sale components
│   ├── shifts/                   # Shift management components
│   ├── internal-transfer/        # Internal transfer components
│   ├── notifications/            # Notification components
│   ├── offline/                  # Offline mode components
│   └── ui/                       # Reusable UI components
│
├── lib/                          # Utilities & Helpers
│   ├── auth.ts                   # Authentication logic
│   ├── auth-server.ts            # Server-side auth
│   ├── auth-helpers.ts           # Auth helper functions
│   ├── prisma.ts                 # Prisma client
│   ├── api-error.ts              # Error handling
│   ├── api-rate-limit.ts         # Rate limiting
│   ├── logger.ts                 # Logging utility
│   ├── memory-monitor.ts         # Memory monitoring
│   ├── server-time.ts            # Server time management
│   ├── shift-status.ts           # Shift status logic
│   ├── transfer-status.ts        # Transfer status logic
│   ├── unit-conversion.ts        # Unit conversion utilities
│   ├── excel-utils.ts            # Excel export/import
│   ├── file-validation.ts        # File upload validation
│   ├── notification-*.ts         # Notification services
│   ├── cron/                     # Scheduled jobs
│   ├── mobile/                   # Mobile utilities
│   ├── offline/                  # Offline sync logic
│   └── pos/                      # POS utilities
│
├── prisma/                       # Database
│   └── schema.prisma             # Database schema (1621 lines)
│
├── scripts/                      # Build & utility scripts
│   ├── generate-openapi.ts       # API doc generation
│   └── init-uploads.js           # Initialize upload directories
│
├── hooks/                        # Custom React Hooks
├── contexts/                     # React Contexts
├── types/                        # TypeScript type definitions
├── styles/                       # Global styles
├── public/                       # Static assets
├── android/                      # Android mobile app
├── migrations/                   # Database migrations
├── uploads/                      # User uploaded files
│
├── middleware.ts                 # Next.js middleware (11KB)
├── instrumentation.ts            # Monitoring & instrumentation
├── capacitor.config.ts           # Capacitor configuration
└── package.json                  # Dependencies
```

---

## 🏗️ Modules Chính

### 1️⃣ **ADMIN MODULE** (`/app/admin/`) 
**Dành cho: ADMIN, MANAGER, WAREHOUSE_STAFF - Quản lý KHO TỔNG (MAIN WAREHOUSE)**

#### Các tính năng:
- 📦 **Quản lý sản phẩm Master Data**
  - Products (sản phẩm)
  - Categories (phân loại)
  - Menu Types (loại thực đơn)
  - Product Recipes (công thức pha chế)
  - Product Packages (đóng gói sản phẩm)
  - Units (đơn vị tính)
  - Conversions (quy đổi đơn vị)
  
- 🏢 **Quản lý hệ thống kho**
  - Warehouses (tạo/sửa kho MAIN và STORE)
  - Warehouse Settings (cấu hình kho, GPS, máy in)
  - Stock Transfer Requests (duyệt yêu cầu từ kho con)
  - Internal Transfers (điều chuyển giữa kho-con ↔ kho-tổng)
  - Inventory Intake (nhập hàng vào kho tổng)
  - Tools Inventory & Tools Transfers (quản lý TB/dụng cụ)
  
- 👥 **Quản lý toàn bộ nhân sự**
  - Users (tất cả người dùng)
  - HR Management (nhân sự)
  - Shifts (ca làm việc tổng)
  - Work Shifts (tạo lịch làm việc)
  
- 📊 **Báo cáo Master**
  - Reports (báo cáo tổng hợp)
  - Store Reports (báo cáo từng cửa hàng)
  - Store Sales (doanh số theo cửa hàng)
  - Store Inventory (tồn kho theo cửa hàng)
  
- 🛒 **Mua hàng & Nhà cung cấp**
  - Suppliers (nhà cung cấp)
  - Purchase Orders (đơn đặt hàng)
  - Supplier Intake (nhập từ NCC)
  
- 🎁 **Khuyến mại & Vouchers**
  - Voucher Programs (chương trình voucher)
  - Promotions (quản lý KM)
  
- 🔧 **Cấu hình & Tools**
  - Settings (cài đặt hệ thống)
  - Setup Tools (công cụ thiết lập ban đầu)

---

### 2️⃣ **STORE MODULE** (`/app/store/`)
**Dành cho: WAREHOUSE_MANAGER, GENERAL_MANAGER, STAFF - Quản lý KHO CON/CỬA HÀNG**

#### Các tính năng:
- 🛍️ **Bán hàng POS**
  - Sales (giao diện POS)
  - Invoices (hóa đơn)
  - Sales Sessions (ca bán hàng: mở ca/đóng ca/đối soát)
  - Shifts (ca làm việc)
  - Register Shifts (đăng ký ca)
  - Shift Swap (đổi ca)
  - Calendar (lịch làm việc)
  - Sales History (lịch sử bán hàng)
  
- 📦 **Quản lý tồn kho cửa hàng**
  - Inventory (kiểm kho)
  - Products (xem sản phẩm, tồn kho)
  - Loss Reports (báo cáo hao hụt/hư hỏng)
  
- 🔄 **Điều chuyển hàng**
  - Internal Transfers (yêu cầu hàng từ kho tổng)
    - Workflow: Staff tạo → Manager duyệt → GM duyệt → Kho tổng xuất → Store nhận
  - Transfers (điều chuyển giữa các kho con)
  - Stock Transfer Requests (yêu cầu điều chuyển)
  - Tools Transfers (điều chuyển thiết bị)
  
- 📊 **Báo cáo cửa hàng**
  - Sales Reports (doanh thu)
  - Inventory Reports (tồn kho)
  - Shift Reports (báo cáo ca)
  
- 👤 **Quản lý nhân viên cửa hàng**
  - Users (WAREHOUSE_MANAGER tạo STAFF/ATTENDANCE_STAFF)
  
- ⚙️ **Cài đặt cửa hàng**
  - Settings (máy in, GPS, cấu hình)

---

### 3️⃣ **WAREHOUSE MODULE** (`/app/warehouse/`)
**Module rút gọn cho nhân viên kho (ít dùng, không rõ ràng phân biệt với Admin)**

#### Các tính năng:
- 📦 Quản lý kho cơ bản
- 🔄 Điều chuyển
- 📊 Báo cáo

> **Lưu ý**: Module này có thể bị deprecated hoặc merge vào Admin/Store

---

### 4️⃣ **HR MODULE** (`/app/hr/`)
**Dành cho: HR - Quản lý nhân sự**

#### Các tính năng:
- 👤 **Quản lý nhân viên**
  - Employees (danh sách nhân viên)
  - **Chỉ được tạo tài khoản ATTENDANCE_STAFF**
  - Quản lý hợp đồng lao động
  - Thông tin cá nhân, CCCD, ngân hàng
  - Trạng thái công việc (Active/On Leave/Terminated)
  
- ⏰ **Chấm công**
  - Attendance (xem/sửa chấm công tất cả nhân viên)
  - Check-in/Check-out với GPS tracking
  - Không được tự chấm công (chỉ quản lý)
  
- 📅 **Quản lý ca làm việc**
  - Shifts (xem lịch ca)
  - Shift Swaps (duyệt đổi ca)
  
- 💰 **Tài chính nhân viên**
  - Salary Advance (duyệt ứng lương)
  - Leave Requests (duyệt nghỉ phép)
  
- 📊 **Báo cáo HR**
  - Attendance Reports
  - Contract Reports
  - Leave Balance Reports

---

### 5️⃣ **ATTENDANCE MODULE** (`/app/attendance/`)
**Dành cho: ATTENDANCE_STAFF - Chỉ chấm công**

#### Các tính năng:
- ✅ **Check-in/Check-out**
  - GPS location tracking
  - Device info logging
  - IP address recording
  
- 📅 **Xem lịch làm việc**
  - Xem ca được phân
  - Đăng ký ca (nếu cho phép)
  
- 📊 **Lịch sử chấm công cá nhân**
  - Xem giờ vào/ra
  - Tổng giờ làm
  
> **Giới hạn**: Không truy cập được /store, không bán hàng, không quản lý


---

## 🔌 API Routes

Hệ thống API RESTful với hơn **50+ endpoints** được tổ chức theo modules:

### Authentication & Authorization
```
POST   /api/auth/login              # Đăng nhập
POST   /api/auth/logout             # Đăng xuất
POST   /api/auth/refresh            # Refresh token
GET    /api/auth/me                 # Thông tin user hiện tại
```

### Product Management
```
GET    /api/products                # Danh sách sản phẩm
GET    /api/products/[id]           # Chi tiết sản phẩm
POST   /api/products                # Tạo sản phẩm
PUT    /api/products/[id]           # Cập nhật sản phẩm
DELETE /api/products/[id]           # Xóa sản phẩm

GET    /api/categories              # Danh mục
GET    /api/menu-types              # Loại menu
GET    /api/product-recipes         # Công thức
GET    /api/product-units           # Đơn vị
GET    /api/product-unit-conversions # Quy đổi đơn vị
GET    /api/unit-relations          # Quan hệ đơn vị
```

### Warehouse & Inventory
```
GET    /api/warehouses              # Danh sách kho
GET    /api/warehouses/[id]         # Chi tiết kho
POST   /api/warehouses              # Tạo kho
PUT    /api/warehouses/[id]         # Cập nhật kho
DELETE /api/warehouses/[id]         # Xóa kho

GET    /api/warehouse-stock         # Tồn kho
GET    /api/stock-transactions      # Lịch sử giao dịch

GET    /api/inventory-checks        # Kiểm kho
POST   /api/inventory-checks        # Tạo phiếu kiểm kho
PUT    /api/inventory-checks/[id]   # Cập nhật kiểm kho

GET    /api/inventory-intake        # Nhập kho
POST   /api/inventory-intake        # Tạo phiếu nhập
PUT    /api/inventory-intake/[id]   # Cập nhật phiếu nhập

GET    /api/inventory-loss-reports  # Báo cáo hao hụt
POST   /api/inventory-loss-reports  # Tạo báo cáo
```

### Transfers
```
GET    /api/warehouse-transfers     # Điều chuyển kho
POST   /api/warehouse-transfers     # Tạo phiếu điều chuyển
PUT    /api/warehouse-transfers/[id] # Cập nhật điều chuyển

GET    /api/internal-transfer-requests    # Điều chuyển nội bộ
POST   /api/internal-transfer-requests    # Tạo yêu cầu
PUT    /api/internal-transfer-requests/[id] # Cập nhật
```

### Sales & POS
```
GET    /api/sales                   # Danh sách hóa đơn
POST   /api/sales                   # Tạo hóa đơn
GET    /api/sales/[id]              # Chi tiết hóa đơn

GET    /api/sales-sessions          # Ca bán hàng
POST   /api/sales-session/open      # Mở ca
POST   /api/sales-session/close     # Đóng ca

GET    /api/promotions              # Khuyến mại
GET    /api/vouchers                # Voucher
POST   /api/voucher-programs        # Chương trình voucher
```

### HR & Attendance
```
GET    /api/users                   # Danh sách nhân viên
POST   /api/users                   # Tạo nhân viên
PUT    /api/users/[id]              # Cập nhật nhân viên

GET    /api/attendance              # Chấm công
POST   /api/attendance/check-in     # Check-in
POST   /api/attendance/check-out    # Check-out

GET    /api/shifts                  # Ca làm việc
GET    /api/leave-requests          # Xin nghỉ phép
GET    /api/salary-advance          # Ứng lương
```

### Reports & Analytics
```
GET    /api/reports                 # Báo cáo tổng hợp
POST   /api/reports/generate        # Tạo báo cáo
GET    /api/reports/[id]            # Chi tiết báo cáo
```

### Suppliers
```
GET    /api/suppliers               # Nhà cung cấp
GET    /api/supplier-products       # Sản phẩm NCC
GET    /api/purchase-orders         # Đơn đặt hàng
POST   /api/purchase-orders         # Tạo đơn
```

### Administrative
```
GET    /api/admin/...               # Admin endpoints
POST   /api/seed-admin              # Seed admin user
GET    /api/settings                # Cấu hình hệ thống
POST   /api/migrations              # Database migrations

GET    /api/notifications           # Thông báo
POST   /api/notifications/send      # Gửi thông báo

GET    /api/server-time             # Thời gian server
GET    /api/client-ip               # IP client
```

### AI & Integration
```
POST   /api/ai/analyze              # AI phân tích
GET    /api/cron/...                # Scheduled jobs
```

### Development & Testing
```
GET    /api/db-test                 # Test database
GET    /api/debug                   # Debug info
GET    /api/doc                     # API Documentation (Swagger)
```

### Mobile & Capacitor
```
POST   /api/capacitor/...           # Mobile-specific APIs
```

---

## 💾 Database Schema

### Core Tables

#### **Users & Authentication**
- `users` - Người dùng hệ thống
  - Thông tin cá nhân, liên hệ
  - Vai trò (Admin/Manager/Staff/Warehouse)
  - Kho được gán
  - Trạng thái công việc & hợp đồng
  - Ngân hàng & lương

#### **Products & Categories**
- `products` - Sản phẩm
- `categories` - Danh mục sản phẩm
- `menu_types` - Loại menu
- `product_units` - Đơn vị tính
- `unit_relations` - Quan hệ quy đổi đơn vị
- `product_recipes` - Công thức pha chế
- `recipe_ingredients` - Nguyên liệu công thức
- `product_package_units` - Đóng gói sản phẩm

#### **Warehouses & Inventory**
- `warehouses` - Kho/Chi nhánh
  - Loại kho (STORE/WAREHOUSE/SUPPLIER/FACTORY)
  - Vị trí GPS
  - Cấu hình máy in
  - Bán kính check-in
  
- `warehouse_stock` - Tồn kho theo kho
- `stock_transactions` - Lịch sử giao dịch kho
  - IMPORT (nhập)
  - EXPORT (xuất)
  - TRANSFER (điều chuyển)
  - ADJUSTMENT (điều chỉnh)
  - LOSS (hao hụt)
  - PRODUCTION (sản xuất)

#### **Inventory Operations**
- `inventory_checks` - Kiểm kho
- `inventory_check_items` - Chi tiết kiểm kho
- `inventory_intakes` - Phiếu nhập kho
- `inventory_loss_reports` - Báo cáo hao hụt
- `inventory_loss_report_items` - Chi tiết hao hụt

#### **Transfers**
- `warehouse_transfers` - Điều chuyển kho
- `warehouse_transfer_items` - Chi tiết điều chuyển
- `internal_transfer_requests` - Yêu cầu điều chuyển nội bộ
- `internal_transfer_request_items` - Chi tiết yêu cầu

#### **Purchase Orders**
- `suppliers` - Nhà cung cấp
- `supplier_products` - Sản phẩm NCC
- `purchase_orders` - Đơn đặt hàng
- `purchase_order_items` - Chi tiết đơn hàng
- `purchase_orders_detail` - Chi tiết đơn hàng mở rộng
- `purchase_orders_detail_items` - Items chi tiết

#### **Sales & POS**
- `sales_invoices` - Hóa đơn bán
- `sales_invoice_items` - Chi tiết hóa đơn
- `sales_sessions` - Ca bán hàng
  - Mở/đóng ca
  - Tiền đầu/cuối ca
  - Doanh thu ca

#### **Promotions & Vouchers**
- `promotions` - Chương trình khuyến mại
- `promotion_products` - Sản phẩm áp dụng KM
- `promotion_gifts` - Quà tặng KM
- `promotion_warehouses` - Kho áp dụng KM
- `promotion_conditions` - Điều kiện KM
- `voucher_programs` - Chương trình voucher
- `vouchers` - Mã voucher
- `voucher_products` - Sản phẩm áp dụng voucher
- `voucher_gifts` - Quà tặng voucher

#### **HR & Work Management**
- `work_shifts` - Ca làm việc
- `shift_assignments` - Phân ca
- `shift_registration_requests` - Đăng ký ca
- `shift_swap_requests` - Đổi ca
- `attendance_sessions` - Chấm công
- `shift_session_logs` - Log ca làm
- `leave_requests` - Xin nghỉ phép
- `salary_advance_requests` - Ứng lương

#### **Legacy (Backward Compatibility)**
- `shift_sessions` - Ca làm việc cũ (deprecated)

#### **Production**
- `production_records` - Sản xuất/pha chế

#### **Reports**
- `reports` - Báo cáo tổng hợp

#### **Notifications**
- `notifications` - Thông báo hệ thống
- `device_tokens` - Token thiết bị (push notification)

#### **System**
- `user_warehouse_assignments` - Phân kho cho user
- `warehouse_category_permissions` - Quyền danh mục theo kho
- `warehouse_printer_configs` - Cấu hình máy in
- `warehouse_sales_targets` - Mục tiêu doanh số

### Key Enums

```typescript
// User roles
enum user_role {
  ADMIN, MANAGER, STAFF, HR, WAREHOUSE_STAFF, ACCOUNTANT
}

// Warehouse types
enum warehouse_type {
  STORE, WAREHOUSE, SUPPLIER, FACTORY
}

// Transaction types
enum transaction_type {
  IMPORT, EXPORT, TRANSFER, ADJUSTMENT, LOSS, PRODUCTION
}

// Transfer status
enum transfer_status {
  CHO_DUYET, DA_DUYET, DANG_XUAT, DA_XUAT, 
  DA_NHAN, TU_CHOI, HOAN_THANH
}

// Purchase order status
enum purchase_order_status {
  DRAFT, SUBMITTED, APPROVED, RECEIVED, CANCELLED
}

// Work status
enum work_status {
  ACTIVE, ON_LEAVE, TERMINATED, SUSPENDED
}

// Employment type
enum employment_type {
  FULLTIME, PARTTIME, CONTRACT, INTERN
}
```

---

## 🚀 Cài Đặt & Chạy

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- pnpm (recommended) hoặc npm

### 1. Clone & Install

```bash
git clone <repository-url>
cd warehouse-express
pnpm install
```

### 2. Cấu hình Database

```bash
# Tạo file .env từ .env.example
cp .env.example .env

# Cập nhật DATABASE_URL trong .env
DATABASE_URL="postgresql://user:password@localhost:5432/warehouse_db"
```

### 3. Generate Prisma Client & Migrate

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed admin user
# Truy cập: http://localhost:3000/api/seed-admin
```

### 4. Chạy Development Server

```bash
pnpm dev
# Server chạy tại: http://localhost:3000
```

### 5. Build Production

```bash
pnpm build
pnpm start

# Hoặc
pnpm build:prod
pnpm start:prod
```

### 6. Mobile App (Android)

```bash
# Sync mobile code
pnpm mobile:sync

# Open Android Studio
pnpm mobile:open

# Run on device
pnpm mobile:dev

# Build APK
pnpm mobile:build:debug
pnpm mobile:build:release
```

---

## 📱 Mobile App Features

### Capacitor Plugins
- ✅ **Barcode Scanner** - Quét mã vạch
- ✅ **Camera** - Chụp ảnh sản phẩm
- ✅ **Geolocation** - GPS tracking
- ✅ **Bluetooth Serial** - Kết nối máy in
- ✅ **Local Notifications** - Thông báo local
- ✅ **Push Notifications** - Firebase FCM
- ✅ **Network** - Phát hiện kết nối
- ✅ **SQLite** - Database offline
- ✅ **Filesystem** - Lưu file local
- ✅ **Device Info** - Thông tin thiết bị
- ✅ **Splash Screen** - Màn hình chào

---

## 📊 Key Features Deep Dive

### 🎯 Multi-Level Permission System
- Role-based access control (RBAC)
- Warehouse-specific permissions
- Category-level permissions
- User warehouse assignments

### 🔄 Offline-First Architecture
- SQLite local storage
- Sync mechanism
- Conflict resolution
- Queue management for offline operations

### 🖨️ Bluetooth Printer Integration
- ESC/POS command support
- Receipt printing
- Invoice printing
- Stock labels

### 📍 GPS Check-in System
- Location-based attendance
- Configurable radius per warehouse
- IP address logging
- Device fingerprinting

### 📊 Advanced Reporting
- Real-time analytics
- Sales reports by shift/day/month
- Inventory turnover
- Loss & wastage tracking
- Excel export

### 🎁 Flexible Promotion Engine
- Time-based promotions
- Quantity-based discounts
- Gift with purchase
- Bundle deals
- Warehouse-specific promos
- Stackable promotions

### 🔐 Security Features
- JWT authentication
- Rate limiting
- API error handling
- Request logging
- Memory monitoring
- Secure file uploads

---

## 🛡️ Middleware & Instrumentation

### `middleware.ts` (11KB)
- Authentication guard
- Role-based routing
- Redirect logic
- Mobile/web detection

### `instrumentation.ts`
- Performance monitoring
- Error tracking
- Memory usage tracking
- Scheduled job initialization (cron)

---

## 📚 API Documentation

Hệ thống tự động generate OpenAPI/Swagger documentation:

```bash
# Generate API docs
pnpm generate-openapi

# Truy cập docs tại:
# http://localhost:3000/api-doc
```

Sử dụng `@scalar/nextjs-api-reference` để hiển thị interactive API docs.

---

## 🧪 Scripts Available

```json
{
  "dev": "Next.js development server",
  "build": "Production build with API docs generation",
  "start": "Start production server",
  "lint": "ESLint check",
  
  "mobile:sync": "Sync Capacitor Android",
  "mobile:open": "Open Android Studio",
  "mobile:dev": "Run mobile dev server",
  "mobile:build:debug": "Build debug APK",
  "mobile:build:release": "Build release APK",
  "mobile:install": "Install debug APK on device"
}
```

---

## 📂 Important Directories

### `/uploads/`
User-uploaded files (images, documents, excel imports)

### `/android/`
Capacitor Android project

### `/prisma/`
- `schema.prisma` - Database schema (1621 lines)
- Migration files

### `/lib/generated/`
Generated Prisma client

### `/scripts/`
Build scripts & utilities

---

## 🔒 Environment Variables

Cần cấu hình các biến môi trường trong `.env`:

```bash
# Database
DATABASE_URL="postgresql://..."

# JWT
JWT_SECRET="..."
JWT_EXPIRES_IN="7d"

# OpenAI (for AI analytics)
OPENAI_API_KEY="..."

# Firebase (push notifications)
FIREBASE_PROJECT_ID="..."
FIREBASE_PRIVATE_KEY="..."
FIREBASE_CLIENT_EMAIL="..."

# App Config
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development|production"
```

---

## 👥 Phân Quyền Người Dùng (User Roles)

Hệ thống chia thành 2 nhóm chính: **KHO TỔNG (MAIN WAREHOUSE)** và **KHO CON (STORE WAREHOUSE)**

### 🏢 KHO TỔNG (MAIN WAREHOUSE) - Truy cập `/admin`

#### 1. **ADMIN** - Quản trị viên
- **Quyền hạn**: Toàn quyền hệ thống
- **Truy cập**: Tất cả modules (Admin, Store, HR, Attendance)
- **Chức năng**:
  - Quản lý toàn bộ hệ thống
  - Tạo/xóa/sửa tất cả users, warehouses, products
  - Cấu hình hệ thống
  - Xem tất cả báo cáo
  - Phê duyệt tất cả yêu cầu
- **Legacy name**: `AdminKhoTong`

#### 2. **MANAGER** - Quản lý kho tổng
- **Quyền hạn**: Quản lý kho MAIN (kho tổng)
- **Truy cập**: Module Admin
- **Chức năng**:
  - Quản lý kho MAIN
  - Phê duyệt yêu cầu điều chuyển từ kho con
  - Xuất hàng cho kho con
  - Quản lý purchase orders
  - Quản lý nhà cung cấp
  - Xem báo cáo kho tổng

#### 3. **WAREHOUSE_STAFF** - Nhân viên kho tổng
- **Quyền hạn**: Thực hiện nghiệp vụ kho MAIN
- **Truy cập**: Module Admin
- **Chức năng**:
  - Nhập/xuất kho MAIN
  - Kiểm kho
  - Xử lý điều chuyển hàng
  - Ghi nhận hao hụt
  - Không có quyền phê duyệt

---

### 🏪 KHO CON/CỬA HÀNG (STORE WAREHOUSE) - Truy cập `/store`

#### 4. **GENERAL_MANAGER** - Tổng quản lý (Quản lý nhiều kho con)
- **Quyền hạn**: Quản lý nhiều kho STORE
- **Truy cập**: Module Store (tất cả kho được gán)
- **Chức năng**:
  - Quản lý nhiều cửa hàng/kho con cùng lúc
  - **Không** truy cập được kho MAIN
  - Xem báo cáo tổng hợp nhiều chi nhánh
  - Phê duyệt yêu cầu của các kho con
  - Quản lý nhân viên các kho con
  - Phân ca làm việc
  - Xem doanh số tất cả kho được gán

#### 5. **WAREHOUSE_MANAGER** - Quản lý kho con (Store Manager)
- **Quyền hạn**: Quản lý một hoặc nhiều kho STORE
- **Truy cập**: Module Store
- **Chức năng**:
  - Quản lý kho con/cửa hàng
  - Phê duyệt yêu cầu điều chuyển nội bộ
  - Quản lý nhân viên cửa hàng
  - Phân ca làm việc
  - Nhập/xuất kho
  - Kiểm kho
  - Xem báo cáo cửa hàng
  - Quản lý bán hàng
- **Legacy name**: `QuanLyKhoCon`

#### 6. **STAFF** - Nhân viên bán hàng
- **Quyền hạn**: Bán hàng và chấm công
- **Truy cập**: Module Store
- **Chức năng**:
  - **BÁN HÀNG** (POS)
  - Tạo hóa đơn
  - Áp dụng khuyến mại/voucher
  - Mở/đóng ca bán hàng
  - **Chấm công** (check-in/check-out)
  - Đăng ký ca làm việc
  - Đổi ca với đồng nghiệp
  - Xin nghỉ phép
  - Tạo yêu cầu điều chuyển nội bộ
  - Xem tồn kho
  - **Có permissions tùy chỉnh** (sales, inventory_check, etc.)

#### 7. **ATTENDANCE_STAFF** - Nhân viên chấm công
- **Quyền hạn**: CHỈ chấm công (KHÔNG bán hàng)
- **Truy cập**: Module Attendance (`/attendance`)
- **Chức năng**:
  - ⏰ **Chấm công** (check-in/check-out) với GPS
  - Xem lịch sử chấm công của bản thân
  - Đăng ký ca làm việc
  - **KHÔNG** được truy cập module Store
  - **KHÔNG** được bán hàng
  - **KHÔNG** có permissions tùy chỉnh
- **Lưu ý**: HR chỉ được tạo loại user này

---

### 👔 NHÂN SỰ (HR) - Truy cập `/hr`

#### 8. **HR** - Quản lý nhân sự
- **Quyền hạn**: Quản lý nhân viên và chấm công
- **Truy cập**: Module HR
- **Chức năng**:
  - Quản lý thông tin nhân viên
  - **CHỈ được tạo tài khoản ATTENDANCE_STAFF**
  - Xem/sửa/duyệt chấm công tất cả nhân viên
  - Xử lý xin nghỉ phép
  - Xử lý ứng lương
  - Xử lý đổi ca
  - Quản lý hợp đồng lao động
  - Xem báo cáo nhân sự

---

### 📊 Ma Trận Quyền Truy Cập

| Role | `/admin` | `/store` | `/hr` | `/attendance` | Bán hàng | Chấm công |
|------|----------|----------|-------|---------------|----------|-----------|
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **MANAGER** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **WAREHOUSE_STAFF** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **GENERAL_MANAGER** | ❌ | ✅ (nhiều kho) | ❌ | ❌ | ✅ | ✅ |
| **WAREHOUSE_MANAGER** | ❌ | ✅ (1+ kho) | ❌ | ❌ | ✅ | ✅ |
| **STAFF** | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **ATTENDANCE_STAFF** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ (chỉ) |
| **HR** | ❌ | ❌ | ✅ | ✅ (xem all) | ❌ | ✅ (xem all) |

---

### 🔐 Phân Quyền Chi Tiết (Permissions System)

**CHỈ áp dụng cho STAFF** - Các role khác có quyền cố định

STAFF có thể được cấp các permissions sau (dạng array):
- `sales` - Bán hàng (POS)
- `inventory_check` - Kiểm kho
- `inventory_intake` - Nhập kho
- `loss_report` - Báo cáo hao hụt
- `transfer` - Điều chuyển hàng
- `internal_transfer` - Điều chuyển nội bộ
- `view_reports` - Xem báo cáo
- `manage_products` - Quản lý sản phẩm (xem/sửa thông tin)

**Lưu ý quan trọng**:
- `WAREHOUSE_MANAGER` và `GENERAL_MANAGER` có **TẤT CẢ** permissions mặc định
- `ATTENDANCE_STAFF` **KHÔNG** có permissions nào (chỉ chấm công)
- `WAREHOUSE_STAFF`, `MANAGER`, `ADMIN` không dùng permissions system (quyền theo role)

---

## 🎨 UI Component System

### Radix UI Components
Sử dụng đầy đủ bộ Radix UI primitives:
- Dialog, Dropdown, Popover
- Accordion, Tabs, Collapsible
- Select, Checkbox, Radio, Switch
- Toast notifications
- Progress bars
- Tooltips

### Mobile UI (Konsta)
iOS/Android style components cho mobile app

---

## 🔧 Utilities & Helpers

### File Processing
- `excel-utils.ts` - Excel import/export
- `xlsx-utils.ts` - XLSX processing
- `file-validation.ts` - Upload validation

### Auth & Security
- `auth.ts` - Main auth logic
- `auth-server.ts` - Server-side auth
- `auth-helpers.ts` - Helper functions
- `rate-limit.ts` - Rate limiting
- `api-rate-limit.ts` - API rate limiting

### Business Logic
- `unit-conversion.ts` - Unit conversions
- `shift-status.ts` - Shift status management
- `transfer-status.ts` - Transfer status logic
- `shift-registration-validation.ts` - Shift validation

### System
- `logger.ts` - Logging
- `memory-monitor.ts` - Memory tracking
- `server-time.ts` - Time management (14KB with tests)
- `timezone.ts` - Timezone handling
- `prisma.ts` - Database client
- `utils.ts` - General utilities

---

## 📖 Additional Resources

- **API Documentation**: `/api-doc`
- **Debug Panel**: `/debug` (development only)
- **Privacy Policy**: `/privacy-policy`

---

## 🤝 Contributing

Dự án được phát triển và bảo trì nội bộ. 

---

## 📞 Support

Liên hệ team phát triển để được hỗ trợ.

---

## 📝 License

Proprietary - All rights reserved

---

**Version**: 1.1.0  
**Last Updated**: 2026-01-10
