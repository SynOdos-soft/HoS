import * as React from 'react';
import { cn } from '@/lib/utils';

export const Field = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('input-group', className)} {...props} />
);

export const FieldLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => <label ref={ref} className={cn('ui-field-label', className)} {...props} />
);
FieldLabel.displayName = 'FieldLabel';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn('ui-input', className)} {...props} />
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn('ui-textarea', className)} {...props} />
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn('ui-select', className)} {...props} />
);
Select.displayName = 'Select';

export const CheckboxRow = ({ className, children, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { children: React.ReactNode }) => (
  <label className={cn('ui-checkbox-row', className)}>
    <input type="checkbox" {...props} />
    <span>{children}</span>
  </label>
);
