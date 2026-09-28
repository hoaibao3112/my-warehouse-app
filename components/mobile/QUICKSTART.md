# 🚀 Quick Start Guide - Mobile UI Components

## Cài đặt nhanh trong 5 phút

### 1. Import component vào trang của bạn

```tsx
import { ResponsiveTable, TableColumn, TableAction } from '@/components/mobile/responsive-table'
```

### 2. Copy code mẫu và thay thế

```tsx
// Define your data type
interface YourData {
  id: string
  name: string
  status: string
  created_at: string
}

// Define columns
const columns: TableColumn<YourData>[] = [
  {
    key: 'name',
    label: 'Tên',
    render: (item) => <span className="font-medium">{item.name}</span>,
  },
  {
    key: 'status',
    label: 'Trạng Thái',
    render: (item) => <Badge>{item.status}</Badge>,
  },
  {
    key: 'created_at',
    label: 'Ngày Tạo',
    render: (item) => formatDate(item.created_at),
    mobilePrimary: true, // Show in mobile card
  },
]

// Define actions
const actions: TableAction<YourData>[] = [
  {
    label: 'Xem',
    icon: <Eye className="w-4 h-4" />,
    onClick: (item) => router.push(`/detail/${item.id}`),
    variant: 'ghost',
  },
  {
    label: 'Xóa',
    icon: <Trash2 className="w-4 h-4" />,
    onClick: (item) => handleDelete(item.id),
    variant: 'ghost',
  },
]

// Use in JSX
<ResponsiveTable
  data={yourData}
  columns={columns}
  actions={actions}
  keyExtractor={(item) => item.id}
  loading={loading}
  emptyMessage="Không có dữ liệu"
  // Mobile customization (optional)
  mobileCardTitle={(item) => item.name}
  mobileCardBadge={(item) => <Badge>{item.status}</Badge>}
  mobileCardMeta={(item) => [
    <>📅 {formatDate(item.created_at)}</>,
  ]}
/>
```

### 3. Test trên mobile

- Chrome DevTools > Toggle device toolbar (Ctrl+Shift+M)
- Chọn iPhone hoặc Android device
- Refresh page

## ✨ Kết quả

### Desktop (giữ nguyên table)
```
┌──────────────────────────────────────┐
│ Tên         │ Trạng Thái │ Ngày Tạo │ Actions │
├──────────────────────────────────────┤
│ Item 1      │ ✅ Active  │ 01/01    │ 👁 🗑   │
│ Item 2      │ ⏸ Pending │ 02/01    │ 👁 🗑   │
└──────────────────────────────────────┘
```

### Mobile (card layout tự động)
```
┌────────────────────────────────┐
│  📦 Item 1             ✅ Active │
│  📅 01/01/2025                  │
│                       ⋮ (menu)  │
└────────────────────────────────┘

┌────────────────────────────────┐
│  📦 Item 2            ⏸ Pending │
│  📅 02/01/2025                  │
│                       ⋮ (menu)  │
└────────────────────────────────┘
```

## 🎨 Common Patterns

### Pattern 1: Status Badge
```tsx
mobileCardBadge={(item) => (
  <Badge variant={item.status === 'active' ? 'success' : 'secondary'}>
    {item.status}
  </Badge>
)}
```

### Pattern 2: Meta Info
```tsx
mobileCardMeta={(item) => [
  <>📅 {formatDate(item.date)}</>,
  <>👤 {item.user_name}</>,
  <>📍 {item.location}</>,
]}
```

### Pattern 3: Conditional Actions
```tsx
const actions: TableAction<Data>[] = [
  {
    label: 'Duyệt',
    icon: <Check className="w-4 h-4" />,
    onClick: handleApprove,
    show: (item) => item.status === 'pending', // Only show for pending
  },
]
```

### Pattern 4: Loading State
```tsx
const actions: TableAction<Data>[] = [
  {
    label: 'Xóa',
    icon: <Trash2 className="w-4 h-4" />,
    onClick: (item) => handleDelete(item.id),
    disabled: (item) => deletingId === item.id, // Disable while deleting
  },
]
```

## 📋 Checklist

- [ ] Import ResponsiveTable
- [ ] Define columns với type
- [ ] Define actions với icons
- [ ] Set keyExtractor
- [ ] Add mobileCardTitle
- [ ] Add mobileCardBadge (optional)
- [ ] Add mobileCardMeta (optional)
- [ ] Test trên mobile device
- [ ] Test tất cả actions
- [ ] Test loading state
- [ ] Test empty state

## 🔗 See Also

- Full documentation: `/components/mobile/README.md`
- Example page: `/app/store/stock-transfer-requests/page-demo.tsx`
- Component code: `/components/mobile/responsive-table.tsx`

## 💬 Need Help?

Common issues và solutions trong README chính!
