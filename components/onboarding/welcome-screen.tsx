'use client';

/**
 * WelcomeScreen Component
 * Onboarding welcome screens for first-time users
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Check } from 'lucide-react';

export interface OnboardingStep {
  title: string;
  description: string;
  icon: string; // Emoji
  image?: string; // Optional image URL
}

interface WelcomeScreenProps {
  steps: OnboardingStep[];
  onComplete: () => void;
  showSkip?: boolean;
}

export function WelcomeScreen({
  steps,
  onComplete,
  showSkip = true
}: WelcomeScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Skip button */}
      {showSkip && !isLastStep && (
        <div className="absolute top-4 right-4">
          <Button variant="ghost" onClick={handleSkip} size="sm">
            Bỏ qua
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Icon/Image */}
        <div className="mb-8">
          {step.image ? (
            <img
              src={step.image}
              alt={step.title}
              className="w-64 h-64 object-contain"
            />
          ) : (
            <div className="text-8xl">{step.icon}</div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-center mb-4 text-gray-900">
          {step.title}
        </h1>

        {/* Description */}
        <p className="text-lg text-center text-gray-600 max-w-md">
          {step.description}
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-8">
        {steps.map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all ${
              index === currentStep
                ? 'w-8 bg-blue-600'
                : 'w-2 bg-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Next button */}
      <div className="p-6">
        <Button
          onClick={handleNext}
          className="w-full h-14 text-lg"
          size="lg"
        >
          {isLastStep ? (
            <>
              <Check className="mr-2 h-5 w-5" />
              Bắt đầu
            </>
          ) : (
            <>
              Tiếp theo
              <ChevronRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
