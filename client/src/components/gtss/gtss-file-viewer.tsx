import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";

export type GTSSFilePreview = {
  id: string;
  label: string;
  content: string;
};

interface GTSSFileViewerProps {
  files: GTSSFilePreview[];
  emptyMessage?: string;
}

export default function GTSSFileViewer({ files, emptyMessage = "No GTSS output available." }: GTSSFileViewerProps) {
  const { toast } = useToast();
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  const defaultTab = useMemo(() => files[0]?.id ?? "", [files]);

  const handleCopy = async (file: GTSSFilePreview) => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(file.content);
      setCopiedFileId(file.id);
      toast({
        title: "Copied",
        description: `${file.label} copied to clipboard`,
      });
      setTimeout(() => setCopiedFileId(null), 1500);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard in this browser.",
        variant: "destructive",
      });
    }
  };

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
          <div className="flex items-center justify-between">
            <p className="text-xs text-grey-500">GTSS specification output</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCopy(file)}
              className="h-7 px-2 text-xs"
            >
              {copiedFileId === file.id ? (
                <Check className="w-3 h-3 mr-1 text-success-600" />
              ) : (
                <Copy className="w-3 h-3 mr-1" />
              )}
              {copiedFileId === file.id ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="mt-2 rounded-md border border-grey-200 bg-grey-50">
            <ScrollArea className="h-48 w-full">
              <pre className="text-xs text-grey-800 p-3 whitespace-pre-wrap font-mono">
                {file.content}
              </pre>
            </ScrollArea>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
