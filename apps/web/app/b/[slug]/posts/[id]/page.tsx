import { PostView } from "@/components/post-view/post-view";
import { loadPost } from "./load-post";

export default async function PostPage({ params, searchParams }: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const [{ slug, id }, { review }] = await Promise.all([params, searchParams]);
  const data = await loadPost(slug, id, review === "1");
  return <PostView key={data.post.id} data={data} variant="page" />;
}
