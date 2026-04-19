import ChatView from "./chat-view";
import { listChatModels } from "@/lib/data/chat";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Infernet Chat — P2P inference playground",
  description:
    "Try the Infernet Protocol: a peer-to-peer network of GPU nodes serving AI inference. No data center, no lock-in."
};

export default async function ChatPage() {
  let models = [];
  try {
    models = await listChatModels();
  } catch {
    models = [];
  }

  return <ChatView initialModels={models} />;
}
