import { BotMessageSquare, Send, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProductChatbot } from "../../features/chatbot/hooks/useProductChatbot";
import type { ChatProductResult } from "../../features/chatbot/types";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { routes } from "../../routes/routes";
import ProductImage from "../../components/ProductImage";
import styles from "./ProductChatbot.module.css";

const ProductChatbot = () => {
    const navigate = useNavigate();
    const { tenantId, tenantSlug } = useStorefrontTenant();
    const {
        isOpen,
        setIsOpen,
        input,
        setInput,
        messages,
        isSearching,
        sendMessage,
        quickPrompts,
        inputPlaceholder,
        isCatalogLoading,
    } = useProductChatbot(tenantId);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [isOpen, messages]);

    if (!tenantId) {
        return null;
    }

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        void sendMessage(input);
    };

    return (<>
      <button type="button" className={styles.fab} onClick={() => setIsOpen((open) => !open)} aria-label={isOpen ? "Close product assistant" : "Open product assistant"}>
        {isOpen ? <X size={22}/> : <BotMessageSquare size={22}/>}
      </button>

      {isOpen && (<div className={styles.panel} role="dialog" aria-label="Product search assistant">
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <BotMessageSquare size={18} aria-hidden="true"/>
              <div>
                <strong>Shop Assistant</strong>
                <span>Search by name, category, or price</span>
              </div>
            </div>
            <button type="button" className={styles.closeButton} onClick={() => setIsOpen(false)} aria-label="Close">
              <X size={18}/>
            </button>
          </div>

          <div className={styles.messages}>
            {messages.map((message) => (<div key={message.id} className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : styles.botRow}`}>
                <div className={`${styles.bubble} ${message.role === "user" ? styles.userBubble : styles.botBubble} ${message.isLoading ? styles.loadingBubble : ""}`}>
                  <p className={styles.messageText}>{message.text}</p>
                  {message.products && message.products.length > 0 && (<div className={styles.results}>
                      {message.products.map((product: ChatProductResult) => (<button key={product._id} type="button" className={styles.productCard} onClick={() => {
                            if (tenantSlug) {
                                navigate(routes.product(tenantSlug, product._id));
                                setIsOpen(false);
                            }
                        }}>
                          <div className={styles.productImageWrap}>
                            <ProductImage
                                src={product.image}
                                alt={product.name}
                                className={styles.productImage}
                                placeholder={<span className={styles.noImage}>No image</span>}
                            />
                          </div>
                          <div className={styles.productInfo}>
                            <span className={styles.productName}>{product.name}</span>
                            {product.categoryName && (<span className={styles.productCategory}>{product.categoryName}</span>)}
                            <span className={styles.productPrice}>
                              ₹{product.finalPrice.toLocaleString("en-IN")}
                            </span>
                          </div>
                        </button>))}
                    </div>)}
                </div>
              </div>))}
            <div ref={messagesEndRef}/>
          </div>

          <div className={styles.quickPrompts}>
            {quickPrompts.map((prompt) => (<button key={prompt} type="button" className={styles.promptChip} onClick={() => void sendMessage(prompt)} disabled={isSearching || isCatalogLoading}>
                {prompt}
              </button>))}
          </div>

          <form className={styles.inputRow} onSubmit={handleSubmit}>
            <input type="text" value={input} onChange={(event) => setInput(event.target.value)} placeholder={inputPlaceholder} disabled={isSearching || isCatalogLoading} aria-label="Search products"/>
            <button type="submit" className={styles.sendButton} disabled={!input.trim() || isSearching || isCatalogLoading} aria-label="Send">
              <Send size={18}/>
            </button>
          </form>
        </div>)}
    </>);
};

export default ProductChatbot;
