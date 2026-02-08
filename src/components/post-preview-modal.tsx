"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Post = any;

interface PostPreviewModalProps {
  post: Post;
  onClose: () => void;
}

export function PostPreviewModal({ post, onClose }: PostPreviewModalProps) {
  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Preview Post #{post.post_number}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="linkedin" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-9">
            <TabsTrigger value="linkedin" className="text-xs">LinkedIn</TabsTrigger>
            <TabsTrigger value="x" className="text-xs">X</TabsTrigger>
            <TabsTrigger value="facebook" className="text-xs">Facebook</TabsTrigger>
            <TabsTrigger value="google" className="text-xs">Google</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[50vh] mt-3">
            <TabsContent value="linkedin" className="mt-0">
              <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1B2A4A] flex items-center justify-center text-white text-xs font-bold">
                    I
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Insero</p>
                    <p className="text-xs text-gray-500">Technology. Simplified.</p>
                  </div>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                  {post.linkedin_content}
                </p>
              </div>
            </TabsContent>

            <TabsContent value="x" className="mt-0">
              <div className="bg-white border rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#1B2A4A] flex items-center justify-center text-white text-xs font-bold">
                    I
                  </div>
                  <div>
                    <span className="text-sm font-bold text-gray-900">Insero</span>
                    <span className="text-sm text-gray-500 ml-1">@inserocloud</span>
                  </div>
                </div>
                <p className="text-[15px] text-gray-900 leading-snug">
                  {post.x_content}
                </p>
                <div className="flex items-center justify-between pt-2 border-t text-xs text-gray-500">
                  <span
                    className={
                      (post.x_content?.length || 0) > 280
                        ? "text-red-500 font-medium"
                        : ""
                    }
                  >
                    {post.x_content?.length || 0}/280
                  </span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="facebook" className="mt-0">
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 border-b">
                  <div className="w-9 h-9 rounded-full bg-[#1B2A4A] flex items-center justify-center text-white text-xs font-bold">
                    I
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Insero</p>
                    <p className="text-xs text-gray-500">Just now</p>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm text-gray-800 whitespace-pre-line">
                    {post.facebook_content}
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="google" className="mt-0">
              <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    G
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Insero - Google Business
                    </p>
                    <p className="text-xs text-gray-500">Update</p>
                  </div>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-line">
                  {post.google_content}
                </p>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
