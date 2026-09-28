# 📱 Mobile UI Improvements

## Tổng quan

Đây là bộ components mới được thiết kế để cải thiện trải nghiệm người dùng trên mobile cho các trang có nhiều table/danh sách phức tạp.

## 🎯 Vấn đề giải quyết

**Trước:**
- Table nhiều cột khó xem và thao tác trên mobile
- Phải scroll ngang rất nhiều
- Buttons nhỏ khó bấm
- Thông tin bị ẩn do không gian hạn chế

**Sau:**
- Card-based layout dễ đọc trên mobile
- Hiển thị thông tin quan trọng ngay trên card
- Swipe để hiện actions
- Bottom sheet cho menu actions
- Responsive tự động (desktop vẫn giữ table)

## 📦 Components

### 1. ResponsiveTable

Component chính để thay thế `<table>` truyền thống.

**Tính năng:**
- ✅ Tự động chuyển giữa table (desktop) và card (mobile)
- ✅ Hỗ trợ custom title, subtitle, badge, meta cho mobile
- ✅ Actions dropdown cho mobile
- ✅ Click vào card để xem chi tiết
- ✅ Loading state
- ✅ Empty state

**Usage:**

```tsx
import { ResponsiveTable, TableColumn, TableAction } from '@/components/mobile/responsive-table'

const columns: TableColumn<YourDataType>[] = [
  {
    key: 'name',
    label: 'Tên',
    render: (item) => <span>{item.name}</span>,
    mobilePrimary: true, // Hiển thị trong card meta
  },
  // ... more columns
]

const actions: TableAction<YourDataType>[] = [
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
    show: (item) => canDelete(item), // Conditional display
    disabled: (item) => isDeleting === item.id,
  },
]

<ResponsiveTable
  data={items}
  columns={columns}
  actions={actions}
  keyExtractor={(item) => item.id}
  loading={loading}
  emptyMessage="Không có dữ liệu"
  // Mobile customization
  mobileCardTitle={(item) => item.name}
  mobileCardSubtitle={(item) => item.description}
  mobileCardBadge={(item) => (
    <Badge>{item.status}</Badge>
  )}
  mobileCardMeta={(item) => [
    <>📅 {formatDate(item.created_at)}</>,
    <>👤 {item.created_by}</>,
  ]}
  onRowClick={(item) => router.push(`/detail/${item.id}`)}
/>
```

### 2. SwipeableCard

Card có thể vuốt để hiện actions (giống iOS mail app).

```tsx
import { SwipeableCard } from '@/components/mobile/swipeable-card'
import { Trash2, Edit } from 'lucide-react'

<SwipeableCard
  actions={[
    {
      label: 'Edit',
      icon: <Edit className="w-5 h-5" />,
      onClick: () => handleEdit(),
      color: 'blue',
    },
    {
      label: 'Delete',
      icon: <Trash2 className="w-5 h-5" />,
      onClick: () => handleDelete(),
      color: 'red',
    },
  ]}
  onClick={() => router.push('/detail')}
>
  <div>
    <h3 className="font-semibold">Item Title</h3>
    <p className="text-sm text-muted-foreground">Item description</p>
  </div>
</SwipeableCard>
```

### 3. MobileBottomSheet

Action menu ở dưới màn hình (native iOS/Android style).

```tsx
import { MobileBottomSheet } from '@/components/mobile/mobile-bottom-sheet'
import { Eye, Edit, Trash2 } from 'lucide-react'

const [sheetOpen, setSheetOpen] = useState(false)

<MobileBottomSheet
  open={sheetOpen}
  onOpenChange={setSheetOpen}
  title="Chọn hành động"
  description="Bạn muốn làm gì với mục này?"
  actions={[
    {
      label: 'Xem chi tiết',
      icon: <Eye className="w-5 h-5" />,
      onClick: () => handleView(),
      variant: 'outline',
    },
    {
      label: 'Chỉnh sửa',
      icon: <Edit className="w-5 h-5" />,
      onClick: () => handleEdit(),
      variant: 'outline',
    },
    {
      label: 'Xóa',
      icon: <Trash2 className="w-5 h-5" />,
      onClick: () => handleDelete(),
      variant: 'destructive',
      disabled: !canDelete,
    },
  ]}
/>
```

## 🚀 Migration Guide

### Bước 1: Import components

```tsx
import { ResponsiveTable, TableColumn, TableAction } from '@/components/mobile/responsive-table'
```

### Bước 2: Define columns và actions

```tsx
const columns: TableColumn<YourDataType>[] = [
  // Cột 1
  {
    key: 'field_name',
    label: 'Label hiển thị',
    render: (item) => <YourCustomRender />, // Optional
    mobilePrimary: true, // Hiển thị trong card meta
  },
  // Cột 2, 3, ...
]

const actions: TableAction<YourDataType>[] = [
  {
    label: 'Action name',
    icon: <IconComponent />,
    onClick: (item) => handleAction(item),
    variant: 'ghost',
    show: (item) => canShow(item), // Optional
    disabled: (item) => isDisabled(item), // Optional
  },
]
```

### Bước 3: Replace table với ResponsiveTable

**Trước:**
```tsx
<table className="w-full">
  <thead>
    <tr>
      <th>Column 1</th>
      <th>Column 2</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {items.map(item => (
      <tr key={item.id}>
        <td>{item.field1}</td>
        <td>{item.field2}</td>
        <td>
          <Button onClick={() => handleAction(item)}>
            <Icon />
          </Button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

**Sau:**
```tsx
<ResponsiveTable
  data={items}
  columns={columns}
  actions={actions}
  keyExtractor={(item) => item.id}
  mobileCardTitle={(item) => item.title}
  mobileCardBadge={(item) => <Badge>{item.status}</Badge>}
/>
```

## 📱 Mobile-First Best Practices

1. **Prioritize Information:**
   - Chỉ hiển thị thông tin quan trọng nhất trong card
   - Sử dụng `mobilePrimary` cho các cột cần thiết
   - Hide các cột phụ với `mobileHidden: true`

2. **Clear Visual Hierarchy:**
   - Title: Thông tin chính (số phiếu, tên)
   - Subtitle: Mô tả ngắn
   - Badge: Trạng thái
   - Meta: Các thông tin bổ sung (ngày, người tạo)

3. **Touch-Friendly:**
   - Card có padding đủ lớn (minimum 16px)
   - Buttons có size tối thiểu 44x44px
   - Spacing giữa các items ít nhất 8px

4. **Progressive Disclosure:**
   - Hiển thị overview trong card
   - Click vào card để xem chi tiết đầy đủ
   - Actions trong dropdown/bottom sheet

## 🎨 Customization

### Custom Card Layout

```tsx
<ResponsiveTable
  // ... other props
  mobileCardTitle={(item) => (
    <div className="flex items-center gap-2">
      <Avatar src={item.avatar} />
      <span>{item.name}</span>
    </div>
  )}
  mobileCardBadge={(item) => (
    <div className="flex gap-2">
      <Badge variant="outline">{item.type}</Badge>
      <Badge variant={item.status === 'active' ? 'success' : 'default'}>
        {item.status}
      </Badge>
    </div>
  )}
/>
```

### Custom Actions Based on State

```tsx
const actions: TableAction<Item>[] = [
  {
    label: 'Duyệt',
    icon: <Check className="w-4 h-4" />,
    onClick: (item) => handleApprove(item.id),
    variant: 'default',
    show: (item) => item.status === 'pending' && hasPermission('approve'),
  },
  {
    label: 'Từ chối',
    icon: <X className="w-4 h-4" />,
    onClick: (item) => handleReject(item.id),
    variant: 'destructive',
    show: (item) => item.status === 'pending' && hasPermission('reject'),
  },
]
```

## 📂 File Examples

Xem các file example:
- `/app/store/stock-transfer-requests/page-demo.tsx` - Full example với ResponsiveTable
- `/components/mobile/responsive-table.example.tsx` - Code examples và patterns

## 🔧 Integration với các trang hiện tại

### Các trang nên migrate:

1. **High Priority:**
   - ✅ `/store/stock-transfer-requests` - Demo đã tạo
   - `/admin/inventory-intake` 
   - `/store/transfers`
   - `/store/supplier-intake`

2. **Medium Priority:**
   - `/store/sales`
   - `/store/reports`
   - `/admin/transfers`
   - `/admin/tools-transfers`

3. **Low Priority:**
   - `/store/users`
   - `/admin/warehouses`
   - `/admin/units`

## 💡 Tips

1. **Testing trên mobile:**
   - Chrome DevTools > Toggle device toolbar (Ctrl+Shift+M)
   - Test cả portrait và landscape
   - Test với different screen sizes

2. **Performance:**
   - ResponsiveTable tự động optimize cho mobile
   - Sử dụng React.memo cho columns/actions nếu cần

3. **Accessibility:**
   - Tất cả actions đều có label
   - Keyboard navigation works (desktop)
   - Touch targets đủ lớn (mobile)

## 🐛 Troubleshooting

**Q: Table vẫn hiển thị thay vì card trên mobile?**
A: Check hook `useIsMobile()` - đảm bảo breakpoint là 768px

**Q: Actions không hiển thị?**
A: Check prop `show` trong TableAction - phải return boolean

**Q: Card quá dài trên mobile?**
A: Giảm số lượng `mobileCardMeta` items, chỉ giữ thông tin quan trọng

**Q: TypeScript errors với columns?**
A: Ensure data type generic `<YourDataType>` matches với actual data

## 📚 Next Steps

1. Apply ResponsiveTable vào các trang quan trọng
2. Thu thập feedback từ users
3. Fine-tune mobile UX based on usage
4. Consider thêm features:
   - Infinite scroll
   - Virtual scrolling cho large lists
   - Advanced filtering UI cho mobile
   - Bulk actions

---

**Created:** November 2025
**Maintainer:** Development Team
**Status:** ✅ Production Ready
