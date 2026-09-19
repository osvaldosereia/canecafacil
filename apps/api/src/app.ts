import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ConversationOrchestrator } from './ai/conversation-orchestrator.js';
import { createConversationOrchestrator } from './ai/conversation-orchestrator.js';
import { createOpenAIConversationInterpreter } from './ai/conversation-interpreter.js';
import { createSupabaseConversationBriefingStore } from './ai/supabase-briefing-store.js';
import type { ChatMessageStore } from './chat/message-store.js';
import { registerChatSessionRoutes } from './chat/session-routes.js';
import type { ChatSessionStore } from './chat/session-store.js';
import { createSupabaseChatMessageStore } from './chat/supabase-message-store.js';
import { createSupabaseChatSessionStore } from './chat/supabase-session-store.js';
import { registerChatTurnRoutes } from './chat/turn-routes.js';
import type { ApiConfig } from './config.js';
import { createServerSupabaseClient } from './lib/supabase.js';
import type { ChatMediaStore } from './media/media-store.js';
import { createSupabaseChatMediaStore } from './media/supabase-media-store.js';
import { registerChatUploadRoutes } from './media/upload-routes.js';
import { registerStorefrontRoutes } from './storefront/storefront-routes.js';
import type { StorefrontService } from './storefront/storefront-service.js';
import { createStorefrontService } from './storefront/storefront-service.js';
import { createSupabaseStorefrontStore } from './storefront/supabase-storefront-store.js';

export type ApiAppConfig = Partial<ApiConfig>;
export interface ApiAppDependencies { sessionStore?: ChatSessionStore; messageStore?: ChatMessageStore; mediaStore?: ChatMediaStore; conversationOrchestrator?: ConversationOrchestrator; storefrontService?: StorefrontService; }
function canCreateSupabaseStore(config: ApiAppConfig): boolean { return Boolean(config.supabaseUrl?.trim() && config.supabaseSecretKey?.trim()); }
function createSupabaseClient(config: ApiAppConfig) { return createServerSupabaseClient({ url: config.supabaseUrl!, secretKey: config.supabaseSecretKey! }); }
function resolveSessionStore(config: ApiAppConfig, d: ApiAppDependencies) { if (d.sessionStore) return d.sessionStore; if (!canCreateSupabaseStore(config)) return undefined; return createSupabaseChatSessionStore(createSupabaseClient(config)); }
function resolveMessageStore(config: ApiAppConfig, d: ApiAppDependencies) { if (d.messageStore) return d.messageStore; if (!canCreateSupabaseStore(config)) return undefined; return createSupabaseChatMessageStore(createSupabaseClient(config)); }
function resolveMediaStore(config: ApiAppConfig, d: ApiAppDependencies) { if (d.mediaStore) return d.mediaStore; if (!canCreateSupabaseStore(config)) return undefined; return createSupabaseChatMediaStore(createSupabaseClient(config)); }
function resolveStorefrontService(config: ApiAppConfig, d: ApiAppDependencies) { if (d.storefrontService) return d.storefrontService; if (!canCreateSupabaseStore(config)) return undefined; return createStorefrontService(createSupabaseStorefrontStore(createSupabaseClient(config))); }
function resolveConversationOrchestrator(config: ApiAppConfig, d: ApiAppDependencies): ConversationOrchestrator | undefined { if (d.conversationOrchestrator) return d.conversationOrchestrator; if (!canCreateSupabaseStore(config) || !config.openAiApiKey?.trim()) return undefined; const client = createSupabaseClient(config); return createConversationOrchestrator({ briefingStore: createSupabaseConversationBriefingStore(client), interpreter: createOpenAIConversationInterpreter({ apiKey: config.openAiApiKey, model: config.openAiConversationModel }) }); }
export function createApiApp(config: ApiAppConfig = {}, dependencies: ApiAppDependencies = {}) { const app=new Hono(); app.get('/health',(c)=>c.json({status:'ok',service:'caneca-facil-api'})); if(config.chatOrigin?.trim()) app.use('/v1/chat/*',cors({origin:config.chatOrigin,allowMethods:['GET','POST','OPTIONS'],allowHeaders:['Content-Type'],credentials:true})); const sessionStore=resolveSessionStore(config,dependencies),messageStore=resolveMessageStore(config,dependencies),mediaStore=resolveMediaStore(config,dependencies),orchestrator=resolveConversationOrchestrator(config,dependencies),storefrontService=resolveStorefrontService(config,dependencies); if(sessionStore&&config.chatOrigin?.trim()&&config.nodeEnv&&config.sessionCookieName?.trim()&&config.sessionTtlDays){ registerChatSessionRoutes(app,{store:sessionStore,chatOrigin:config.chatOrigin,nodeEnv:config.nodeEnv,sessionCookieName:config.sessionCookieName,sessionTtlDays:config.sessionTtlDays}); if(messageStore) registerChatTurnRoutes(app,{sessionStore,messageStore,chatOrigin:config.chatOrigin,sessionCookieName:config.sessionCookieName,orchestrator}); if(mediaStore) registerChatUploadRoutes(app,{sessionStore,mediaStore,chatOrigin:config.chatOrigin,sessionCookieName:config.sessionCookieName}); if(storefrontService) registerStorefrontRoutes(app,{sessionStore,service:storefrontService,chatOrigin:config.chatOrigin,sessionCookieName:config.sessionCookieName}); } return app; }
