import { useEffect, useState } from 'preact/hooks';

/** Object URL for a stored ArrayBuffer; revoked when the data changes or the component unmounts. */
export function useObjectUrl(data: ArrayBuffer | undefined, mime: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!data) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(new Blob([data], { type: mime }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data, mime]);
  return url;
}
