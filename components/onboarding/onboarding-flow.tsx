'use client';

/**
 * OnboardingFlow Component
 * Complete onboarding flow with welcome screens and permission requests
 */

import { useState } from 'react';
import { WelcomeScreen, OnboardingStep } from './welcome-screen';
import { PermissionRequest, PermissionItem } from './permission-request';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const welcomeSteps: OnboardingStep[] = [
  {
    title: 'Chào mừng đến với Warehouse Express',
    description: 'Quản lý kho hàng dễ dàng, nhanh chóng và hiệu quả',
    icon: '📦'
  },
  {
    title: 'Quét mã vạch nhanh chóng',
    description: 'Quét mã vạch sản phẩm để thêm vào đơn hàng chỉ trong vài giây',
    icon: '📱'
  },
  {
    title: 'In hóa đơn qua Bluetooth',
    description: 'Kết nối máy in Bluetooth và in hóa đơn, phiếu xuất kho ngay lập tức',
    icon: '🖨️'
  },
  {
    title: 'Nhận thông báo real-time',
    description: 'Cập nhật ngay khi có đơn hàng mới, hàng sắp hết hoặc yêu cầu chuyển kho',
    icon: '🔔'
  },
  {
    title: 'Chụp ảnh chứng từ',
    description: 'Chụp ảnh voucher, phiếu nhập hàng và đính kèm vào báo cáo',
    icon: '📸'
  }
];

const permissions: PermissionItem[] = [
  {
    id: 'camera',
    icon: 'camera',
    title: 'Camera',
    description: 'Cho phép chụp ảnh chứng từ và quét mã vạch sản phẩm',
    required: false
  },
  {
    id: 'notifications',
    icon: 'notifications',
    title: 'Thông báo',
    description: 'Nhận thông báo về đơn hàng mới, hàng sắp hết và cảnh báo quan trọng',
    required: false
  },
  {
    id: 'bluetooth',
    icon: 'bluetooth',
    title: 'Bluetooth',
    description: 'Kết nối máy in Bluetooth để in hóa đơn và phiếu kho',
    required: false
  }
];

type FlowStep = 'welcome' | 'permissions' | 'complete';

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<FlowStep>('welcome');

  const handleWelcomeComplete = () => {
    setCurrentStep('permissions');
  };

  const handlePermissionsComplete = () => {
    setCurrentStep('complete');
    onComplete();
  };

  const handlePermissionsSkip = () => {
    setCurrentStep('complete');
    onComplete();
  };

  if (currentStep === 'welcome') {
    return (
      <WelcomeScreen
        steps={welcomeSteps}
        onComplete={handleWelcomeComplete}
        showSkip
      />
    );
  }

  if (currentStep === 'permissions') {
    return (
      <PermissionRequest
        permissions={permissions}
        onComplete={handlePermissionsComplete}
        onSkip={handlePermissionsSkip}
      />
    );
  }

  return null;
}
