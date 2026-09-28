"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link 
            href="/" 
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">
            Chính sách Bảo mật & Quyền riêng tư
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6 md:p-8 space-y-8">
          {/* App Info */}
          <section className="text-center border-b pb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Warehouse Express
            </h2>
            <p className="text-gray-600">
              Ứng dụng quản lý kho hàng
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Cập nhật lần cuối: {new Date().toLocaleDateString('vi-VN', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </section>

          {/* Introduction */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              1. Giới thiệu
            </h3>
            <p className="text-gray-700 leading-relaxed">
              Chào mừng bạn đến với ứng dụng Warehouse Express. Chúng tôi cam kết bảo vệ quyền 
              riêng tư và bảo mật thông tin cá nhân của bạn. Chính sách này mô tả cách chúng tôi 
              thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu của bạn khi sử dụng ứng dụng của chúng tôi.
            </p>
          </section>

          {/* Data Collection */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              2. Thông tin chúng tôi thu thập
            </h3>
            <p className="text-gray-700 mb-3">
              Chúng tôi có thể thu thập các loại thông tin sau:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>
                <strong>Thông tin tài khoản:</strong> Tên đăng nhập, mật khẩu (được mã hóa), 
                thông tin cá nhân cần thiết cho việc xác thực
              </li>
              <li>
                <strong>Thông tin thiết bị:</strong> Loại thiết bị, hệ điều hành, định danh 
                thiết bị duy nhất để gửi thông báo đẩy
              </li>
              <li>
                <strong>Dữ liệu camera:</strong> Hình ảnh chụp từ camera để quét mã vạch sản phẩm 
                (chỉ xử lý cục bộ, không lưu trữ hình ảnh)
              </li>
              <li>
                <strong>Dữ liệu vị trí:</strong> Thông tin vị trí để xác định kho hàng và theo 
                dõi giao hàng (nếu được cho phép)
              </li>
              <li>
                <strong>Dữ liệu hoạt động:</strong> Lịch sử nhập/xuất kho, thông tin ca làm việc, 
                nhật ký hoạt động trong ứng dụng
              </li>
            </ul>
          </section>

          {/* Data Usage */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              3. Cách chúng tôi sử dụng thông tin
            </h3>
            <p className="text-gray-700 mb-3">
              Chúng tôi sử dụng thông tin thu thập được để:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Cung cấp và duy trì dịch vụ quản lý kho hàng</li>
              <li>Xác thực và quản lý tài khoản người dùng</li>
              <li>Gửi thông báo quan trọng về hoạt động kho hàng</li>
              <li>Theo dõi và báo cáo hoạt động nhập xuất kho</li>
              <li>Cải thiện và tối ưu hóa trải nghiệm người dùng</li>
              <li>Đảm bảo an toàn và bảo mật hệ thống</li>
              <li>Tuân thủ các yêu cầu pháp lý</li>
            </ul>
          </section>

          {/* Data Storage */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              4. Lưu trữ và bảo mật dữ liệu
            </h3>
            <p className="text-gray-700 mb-3">
              Chúng tôi áp dụng các biện pháp bảo mật sau:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Mã hóa mật khẩu bằng thuật toán bcrypt</li>
              <li>Sử dụng kết nối HTTPS an toàn cho mọi giao tiếp</li>
              <li>Xác thực JWT (JSON Web Token) cho phiên đăng nhập</li>
              <li>Lưu trữ dữ liệu trên máy chủ được bảo mật</li>
              <li>Hạn chế quyền truy cập dữ liệu theo vai trò người dùng</li>
              <li>Sao lưu dữ liệu định kỳ</li>
            </ul>
          </section>

          {/* Permissions */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              5. Quyền truy cập ứng dụng
            </h3>
            <p className="text-gray-700 mb-3">
              Ứng dụng yêu cầu các quyền sau trên thiết bị của bạn:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>
                <strong>Camera:</strong> Để quét mã vạch sản phẩm và chụp ảnh hàng hóa
              </li>
              <li>
                <strong>Thông báo đẩy:</strong> Để nhận cảnh báo và cập nhật quan trọng về 
                hoạt động kho hàng
              </li>
              <li>
                <strong>Vị trí:</strong> Để xác định vị trí kho và hỗ trợ giao hàng 
                (tùy chọn, có thể tắt)
              </li>
              <li>
                <strong>Lưu trữ:</strong> Để lưu trữ dữ liệu tạm thời và xuất báo cáo
              </li>
              <li>
                <strong>Internet:</strong> Để đồng bộ dữ liệu với máy chủ
              </li>
            </ul>
          </section>

          {/* Data Sharing */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              6. Chia sẻ thông tin
            </h3>
            <p className="text-gray-700 mb-3">
              Chúng tôi <strong>KHÔNG</strong> bán, cho thuê hoặc chia sẻ thông tin cá nhân 
              của bạn với bên thứ ba vì mục đích thương mại. Thông tin chỉ được chia sẻ trong 
              các trường hợp sau:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Với sự đồng ý của bạn</li>
              <li>Với các nhà cung cấp dịch vụ hỗ trợ vận hành ứng dụng (hosting, thông báo đẩy)</li>
              <li>Khi được yêu cầu bởi pháp luật hoặc cơ quan có thẩm quyền</li>
              <li>Để bảo vệ quyền lợi và an toàn của người dùng và hệ thống</li>
            </ul>
          </section>

          {/* User Rights */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              7. Quyền của người dùng
            </h3>
            <p className="text-gray-700 mb-3">
              Bạn có các quyền sau đối với dữ liệu cá nhân:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>
                <strong>Quyền truy cập:</strong> Xem thông tin cá nhân của bạn trong ứng dụng
              </li>
              <li>
                <strong>Quyền chỉnh sửa:</strong> Cập nhật thông tin cá nhân không chính xác
              </li>
              <li>
                <strong>Quyền xóa:</strong> Yêu cầu xóa tài khoản và dữ liệu liên quan
              </li>
              <li>
                <strong>Quyền thu hồi:</strong> Rút lại sự đồng ý cho các quyền truy cập thiết bị
              </li>
              <li>
                <strong>Quyền khiếu nại:</strong> Liên hệ với chúng tôi nếu có thắc mắc về quyền riêng tư
              </li>
            </ul>
          </section>

          {/* Data Retention */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              8. Thời gian lưu trữ dữ liệu
            </h3>
            <p className="text-gray-700 leading-relaxed">
              Chúng tôi lưu trữ dữ liệu của bạn trong thời gian cần thiết để cung cấp dịch vụ 
              và tuân thủ các nghĩa vụ pháp lý. Khi bạn yêu cầu xóa tài khoản, dữ liệu cá nhân 
              sẽ được xóa trong vòng 30 ngày, ngoại trừ các dữ liệu cần thiết cho mục đích 
              kế toán và pháp lý.
            </p>
          </section>

          {/* Children */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              9. Bảo vệ trẻ em
            </h3>
            <p className="text-gray-700 leading-relaxed">
              Ứng dụng này không dành cho người dưới 16 tuổi. Chúng tôi không cố ý thu thập 
              thông tin từ trẻ em. Nếu bạn phát hiện trẻ em đã cung cấp thông tin cho chúng 
              tôi, vui lòng liên hệ để chúng tôi xử lý.
            </p>
          </section>

          {/* Policy Changes */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              10. Thay đổi chính sách
            </h3>
            <p className="text-gray-700 leading-relaxed">
              Chúng tôi có thể cập nhật chính sách này theo thời gian. Mọi thay đổi quan trọng 
              sẽ được thông báo qua ứng dụng hoặc email. Việc tiếp tục sử dụng ứng dụng sau 
              khi thay đổi có hiệu lực đồng nghĩa với việc bạn chấp nhận chính sách mới.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              11. Liên hệ
            </h3>
            <p className="text-gray-700 mb-3">
              Nếu bạn có bất kỳ câu hỏi, thắc mắc hoặc yêu cầu nào liên quan đến chính sách 
              bảo mật này, vui lòng liên hệ với chúng tôi qua:
            </p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-gray-700">
                <strong>Email:</strong>{" "}
                <a 
                  href="mailto:support@warehouseexpress.com" 
                  className="text-blue-600 hover:underline"
                >
                  support@warehouseexpress.com
                </a>
              </p>
              <p className="text-gray-700">
                <strong>Ứng dụng:</strong> Warehouse Express
              </p>
            </div>
          </section>

          {/* Agreement */}
          <section className="border-t pt-6">
            <p className="text-gray-700 text-center italic">
              Bằng việc sử dụng ứng dụng Warehouse Express, bạn đồng ý với các điều khoản 
              trong Chính sách Bảo mật và Quyền riêng tư này.
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-500 text-sm mt-8 pb-8">
          <p>© {new Date().getFullYear()} Warehouse Express. Tất cả quyền được bảo lưu.</p>
        </footer>
      </main>
    </div>
  );
}
