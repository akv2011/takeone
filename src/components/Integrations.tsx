import { motion } from "framer-motion";
import { Monitor, MessageCircle } from "lucide-react";
import { useProductCapabilities } from "../hooks/useProductCapabilities";

interface IntegrationItem {
  name: string;
  icon: React.ReactNode;
  accentClass: string;
}

const INTEGRATIONS: IntegrationItem[] = [
  { name: "Web Studio", icon: <Monitor className="w-4 h-4" />, accentClass: "group-hover:text-ink" },
  { name: "Telegram", icon: <MessageCircle className="w-4 h-4" />, accentClass: "group-hover:text-ink" },
];

export default function Integrations() {
  const capabilities = useProductCapabilities();
  const integrations = capabilities?.telegram.available ? INTEGRATIONS : INTEGRATIONS.slice(0, 1);
  return (
    <section className="w-full py-12 px-6 md:px-12 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
      
      {/* Title */}
      <div className="flex flex-col gap-1 max-w-xs text-center md:text-left">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
          Two ways to create
        </span>
        <h3 className="font-display font-bold text-lg text-ink">
          {capabilities?.telegram.available ? "Create on the web. Continue in chat." : "Create and finish on the web."}
        </h3>
        <p className="font-sans text-xs text-muted">
          {capabilities?.telegram.available ? "Connect Telegram from your dashboard to share your account, video history and allowance." : "Use one workspace to create, review and download your videos."}
        </p>
      </div>

      {/* Integration Badges */}
      <div className="flex flex-wrap justify-center gap-3">
        {integrations.map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
            className={`group flex items-center gap-2.5 px-4 py-2.5 rounded-full border border-line bg-white text-xs font-mono text-muted cursor-default transition-colors duration-200 ${item.accentClass}`}
          >
            {item.icon}
            <span className="font-bold text-ink group-hover:text-inherit transition-colors">
              {item.name}
            </span>
          </motion.div>
        ))}
      </div>

    </section>
  );
}
