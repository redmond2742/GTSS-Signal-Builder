import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Download } from "lucide-react";

export type GTSSFilePreview = {
  id: string;
  label: string;
  content: string;
};

interface GTSSFileViewerProps {
  files: GTSSFilePreview[];
  emptyMessage?: string;
}

interface GTSSFileTextProps {
  file: GTSSFilePreview;
  /** Line above the text. */
  caption?: ReactNode;
  /** Tailwind height class for the scrolling text area. */
  heightClass?: string;
  /** Offer the text as a file named after the label. */
  download?: boolean;
  /** Anything else to put beside the buttons, such as a filter. */
  actions?: ReactNode;
}

/** One file's text, as it would be exported, with Copy (and optionally Download). */
export function GTSSFileText({
  file,
  caption = "GTSS specification output",
  heightClass = "h-48",
  download = false,
  actions,
}: GTSSFileTextProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      toast({
        title: "Copied",
        description: `${file.label} copied to clipboard`,
      });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard in this browser.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.label;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-grey-500">{caption}</p>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-xs"
          >
            {copied ? (
              <Check className="w-3 h-3 mr-1 text-success-600" />
            ) : (
              <Copy className="w-3 h-3 mr-1" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          {download && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="h-7 px-2 text-xs"
            >
              <Download className="w-3 h-3 mr-1" />
              Download
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2 rounded-md border border-grey-200 bg-grey-50">
        <ScrollArea className={`${heightClass} w-full`}>
          <pre className="text-xs text-grey-800 p-3 whitespace-pre-wrap font-mono">
            {file.content}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}

export default function GTSSFileViewer({
  files,
  emptyMessage = "No GTSS output available.",
}: GTSSFileViewerProps) {
  const defaultTab = useMemo(() => files[0]?.id ?? "", [files]);

  if (files.length === 0) {
    return <p className="text-sm text-grey-500">{emptyMessage}</p>;
  }

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="flex flex-wrap justify-start">
        {files.map((file) => (
          <TabsTrigger key={file.id} value={file.id} className="text-xs">
            {file.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {files.map((file) => (
        <TabsContent key={file.id} value={file.id}>
          <GTSSFileText file={file} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
