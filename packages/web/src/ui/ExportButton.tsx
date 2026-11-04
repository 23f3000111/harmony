import { Download } from 'lucide-react';
import { useState } from 'react';
import { downloadFile } from '@/lib/platform';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { useToast } from './Toast';

export function ExportButton({ path, filename, label, size = 'md', variant = 'secondary' }: { path: string; filename: string; label: string; size?: ButtonSize; variant?: ButtonVariant }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      icon={Download}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFile(path, filename);
        } catch (error) {
          toast({ title: (error as Error).message, tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
