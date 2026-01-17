'use client';

import { useState } from 'react';
import { FileText, Loader2, Send, CheckCircle } from 'lucide-react';

interface DigestResult {
  content: string;
  items_count: number;
  date: string;
}

interface GenerateResponse {
  success: boolean;
  digest: DigestResult;
  whatsapp_sent: boolean;
  message: string;
}

export function GenerateDigestButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/digest/generate', {
        method: 'POST'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'שגיאה ביצירת סיכום');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא ידועה');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleGenerate}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        צור ושלח סיכום
      </button>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-green-700 font-medium">{result.message}</span>
            </div>
            <span className="text-sm text-green-600">{result.digest.items_count} פריטים</span>
          </div>
          
          {result.whatsapp_sent && (
            <div className="text-sm text-green-600 mb-2 flex items-center gap-1">
              <Send className="w-3 h-3" />
              נשלח בוואטסאפ
            </div>
          )}
          
          <div className="whitespace-pre-wrap text-foreground bg-white p-3 rounded border mt-2 text-sm" dir="rtl">
            {result.digest.content}
          </div>
        </div>
      )}
    </div>
  );
}
