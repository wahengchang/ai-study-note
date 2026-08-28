1｜穩定核心 Core：所有主要單元
#	Core 單元	主要責任
1	Bootstrap	啟動 WordPress、載入設定與程式
2	Configuration	網站、環境、Database、路徑設定
3	Plugin Loader	發現及載入啟用中的 Plugin
4	Hook System	管理 Actions、Filters、Callbacks、Priority
5	Request Router	解析 URL、Rewrite Rules、Query Variables
6	Query Engine	將請求轉成內容查詢
7	Content System	Post、Page、Revision、Attachment、Custom Post Type
8	Metadata System	Post Meta、User Meta、Term Meta、Comment Meta
9	Taxonomy System	Category、Tag、Custom Taxonomy
10	User System	User、Session、Authentication
11	Authorization	Roles、Capabilities、Permission Check
12	Database Layer	$wpdb、SQL、Schema、Database Upgrade
13	Options System	網站設定、Plugin 設定
14	Cache System	Object Cache、Transients、Page Cache Drop-in
15	Theme System	Theme 載入、Template Hierarchy
16	Rendering System	The Loop、Template、Block Rendering
17	Block System	Block Registration、Parser、Editor、Server Rendering
18	REST API	JSON API、Routes、Controllers、Authentication
19	Admin System	Dashboard、Admin Pages、Settings、Editor
20	Media System	Upload、Attachment、Image Processing
21	Comments System	留言、審核、Comment Meta
22	Cron System	排程事件、背景工作
23	HTTP API	呼叫第三方 API
24	Filesystem API	安裝、更新、讀寫檔案
25	Update System	Core、Plugin、Theme 更新
26	Security System	Nonce、Sanitize、Validate、Escape
27	Internationalization	語言包、翻譯、Locale
28	Multisite	Network、Sites、Network Plugins
29	Recovery Mode	Fatal Error 偵測與復原
30	Site Health	系統健康、效能與設定檢查
31	WP-CLI Interface	命令列管理入口
32	Mail System	Email 發送
33	Privacy System	個資匯出、清除與隱私聲明
34	Error System	WP_Error、Debug、Logging

可以把它再歸納成六層：

WordPress Core
├── 啟動層
│   ├── Bootstrap
│   ├── Configuration
│   └── Plugin / Theme Loader
│
├── 執行層
│   ├── Hook System
│   ├── Routing
│   ├── Query Engine
│   └── Rendering
│
├── Domain 層
│   ├── Content
│   ├── Taxonomy
│   ├── Metadata
│   ├── Users
│   ├── Media
│   └── Comments
│
├── Infrastructure 層
│   ├── Database
│   ├── Cache
│   ├── Filesystem
│   ├── HTTP
│   └── Cron
│
├── Interface 層
│   ├── Frontend
│   ├── Admin
│   ├── REST API
│   ├── Block Editor
│   └── WP-CLI
│
└── Governance 層
    ├── Security
    ├── Permissions
    ├── Updates
    ├── Privacy
    ├── Recovery
    └── Internationalization
2｜PHP CMS Runtime：一次請求的重要事件
2.1 Bootstrap 啟動階段
順序	單元／事件	發生什麼事
1	Web Server	Apache/Nginx 接收請求
2	index.php	Frontend 主要入口
3	wp-blog-header.php	要求 WordPress 啟動並輸出內容
4	wp-load.php	尋找並載入設定
5	wp-config.php	Database、環境、Constants
6	wp-settings.php	正式建立 WordPress Runtime
7	Core Libraries	載入核心 Functions、Classes
8	Database	建立 $wpdb
9	Object Cache	啟動預設或外部 Cache
10	Default Filters	註冊 Core 自己的 Hooks
11	Multisite	如有啟用，載入 Network 環境
12	Drop-ins	載入特殊替換元件

常見 Drop-ins 包括：

advanced-cache.php
object-cache.php
db.php
sunrise.php
maintenance.php

它們比普通 Plugin 更靠近底層，可以替換 Cache、Database 等核心行為。

2.2 Plugin 載入階段
順序	事件	說明
1	載入 Must-use Plugins	強制啟用的系統 Plugin
2	mu_plugin_loaded	每個 MU Plugin 載入後
3	載入 Network Plugins	Multisite 全網啟用 Plugin
4	network_plugin_loaded	每個 Network Plugin 載入後
5	muplugins_loaded	MU 與 Network Plugins 完成
6	載入 Active Plugins	逐個 include_once
7	plugin_loaded	每個普通 Plugin 載入後
8	plugins_loaded	全部 Active Plugins 完成

Plugin 的主檔案在這個階段通常會：

載入 Composer Autoloader
建立 Bootstrap/Container
註冊 Action
註冊 Filter
註冊 Activation/Deactivation Hook
檢查依賴及版本
準備後續初始化

⚠️ 這個階段通常只做「註冊」，不應執行昂貴的資料查詢或外部 API。

2.3 Theme、User 與應用初始化
順序	事件	主要用途
1	setup_theme	Theme 載入前
2	Theme functions.php	載入 Child/Parent Theme 功能
3	after_setup_theme	註冊 Theme Support、Menus
4	User Initialization	驗證 Cookie、建立 Current User
5	set_current_user	Current User 已建立
6	init	Plugin 最重要的初始化事件
7	widgets_init	註冊 Widgets、Sidebars
8	wp_loaded	WordPress、Plugin、Theme 全部完成

init 通常用來註冊：

Custom Post Types
Taxonomies
Shortcodes
Rewrite Rules
Blocks
Sessions
自訂 Domain Objects
2.4 Routing 與 Query 階段
順序	事件	說明
1	Rewrite Match	URL 對應 Rewrite Rules
2	parse_request	URL 轉成 Query Variables
3	send_headers	準備 HTTP Headers
4	parse_query	建立 WP_Query 條件
5	pre_get_posts	Plugin 可修改主查詢
6	SQL Generation	產生 SQL
7	Database Query	從資料庫取得 Posts
8	posts_selection	Post 選取階段完成
9	wp	主查詢與環境已建立

例如：

/blog/wordpress-plugin
        ↓
Rewrite Rules
        ↓
post_type = post
name = wordpress-plugin
        ↓
WP_Query
        ↓
SELECT ... FROM wp_posts
2.5 Rendering 階段
順序	事件	說明
1	template_redirect	輸出前，可 Redirect 或攔截
2	Template Hierarchy	尋找合適模板
3	template_include	Plugin 可替換模板
4	Theme Template	執行 PHP/Block Template
5	get_header	Header 開始
6	wp_head	輸出 Head 資源
7	The Loop	逐筆輸出內容
8	the_title	Filter 標題
9	the_content	Filter 文章內容
10	get_sidebar	載入 Sidebar
11	wp_footer	輸出 Footer 資源
12	shutdown	請求結束

因此 Plugin 可以在不同位置介入：

Request
  ↓
修改 Route
  ↓
修改 Query
  ↓
修改查詢結果
  ↓
替換 Template
  ↓
修改 Content
  ↓
加入 JS/CSS
  ↓
Response
3｜Plugin Architecture：所有主要單元

這裡要分成兩種角度：

WordPress 如何管理 Plugin
一個良好 Plugin 內部應有哪些單元
3.1 WordPress Plugin Engine
單元	責任
Plugin Directory	儲存 Plugin 程式碼
Plugin Header Parser	讀取名稱、版本、依賴
Plugin Registry	記錄安裝及啟用狀態
Dependency Checker	檢查 WordPress、PHP、其他 Plugin
Plugin Loader	載入 Plugin 主檔案
Hook Registry	保存 Callback
Hook Dispatcher	按 Priority 執行 Callback
Activation Manager	執行啟用程序
Deactivation Manager	執行停用程序
Uninstall Manager	執行資料清理
Update Manager	檢查及安裝新版
Recovery Manager	處理 Plugin Fatal Error

Plugin Header 可以聲明：

Plugin Name
Description
Version
Author
License
Text Domain
Requires WordPress
Requires PHP
Requires Plugins
Update URI
Network
3.2 Plugin 內部推薦架構
Plugin
├── Manifest / Main File
├── Bootstrap
├── Lifecycle
│   ├── Installer
│   ├── Activator
│   ├── Migrator
│   ├── Deactivator
│   └── Uninstaller
│
├── Domain
│   ├── Models
│   ├── Services
│   ├── Business Rules
│   └── Events
│
├── WordPress Integration
│   ├── Hooks
│   ├── Post Types
│   ├── Taxonomies
│   ├── Metadata
│   ├── REST Routes
│   ├── Blocks
│   ├── Admin Pages
│   ├── Cron
│   └── CLI Commands
│
├── Data
│   ├── Repository
│   ├── Options
│   ├── Metadata
│   ├── Custom Tables
│   ├── Cache
│   └── Files
│
├── Presentation
│   ├── Admin UI
│   ├── Frontend
│   ├── Templates
│   ├── JavaScript
│   └── CSS
│
└── Foundation
    ├── Security
    ├── Permissions
    ├── Validation
    ├── Internationalization
    ├── Logging
    ├── Compatibility
    └── Testing
4｜Plugin 的完整生命週期與事件
Phase 1：安裝 Install
下載 Plugin
→ 驗證套件
→ 解壓縮
→ 放入 wp-content/plugins
→ 掃描 Plugin Header
→ 顯示在 Plugin 清單

此時：

Plugin 已存在
但未必已啟用
主程式通常還不會在普通請求中執行
Phase 2：啟用 Activate
使用者按 Activate
→ 檢查 WordPress/PHP/Plugin 依賴
→ 載入其他 Active Plugins
→ 載入目標 Plugin
→ activate_plugin
→ activate_{plugin-file}
→ 執行 Activation Callback
→ activated_plugin
→ 記錄為 Active
→ Redirect

Activation 適合執行：

建立預設 Options
建立 Custom Tables
記錄 Schema Version
建立 Roles/Capabilities
建立必要目錄
註冊 Rewrite 後 Flush
建立初始排程

不適合：

每次啟用都重建全部資料
長時間同步
大量外部 API 請求
直接輸出 HTML
Phase 3：正常 Runtime

每個完整 WordPress 請求：

載入 Plugin 主檔
→ Plugin Bootstrap
→ 註冊 Hooks
→ plugins_loaded
→ init
→ 根據請求執行相應 Callback
→ shutdown

Plugin 在 Runtime 可能收到的事件類型：

類型	典型事件
系統啟動	plugins_loaded、init、wp_loaded
文章	save_post、before_delete_post
使用者	user_register、profile_update
登入	wp_login、wp_logout
Query	pre_get_posts、posts_where
Rendering	template_include、the_content
Assets	wp_enqueue_scripts
Admin	admin_init、admin_menu
REST	rest_api_init
Cron	自訂 Scheduled Hook
Email	wp_mail
結束	shutdown
Phase 4：更新 Update
發現新版
→ 下載套件
→ Maintenance Mode
→ 替換 Plugin Files
→ upgrader_process_complete
→ 下一次載入 Plugin
→ 比較 Plugin/Schema Version
→ 執行 Migration

成熟 Plugin 通常分開保存：

Plugin Code Version: 3.2.0
Database Schema Version: 7

因為程式版本升級，不一定代表資料庫 Schema 必須改變。

Phase 5：停用 Deactivate
使用者按 Deactivate
→ deactivate_plugin
→ deactivate_{plugin-file}
→ 執行 Deactivation Callback
→ deactivated_plugin
→ 從 Active Plugin 清單移除

適合執行：

停止 Cron
清理 Temporary Cache
移除暫時 Rewrite Rules
關閉 Background Processing

通常保留：

Plugin 設定
使用者資料
Custom Tables
已建立內容
Phase 6：解除安裝 Uninstall
使用者按 Delete
→ Plugin 必須先 Deactivate
→ 執行 uninstall.php
   或 registered uninstall callback
→ 根據策略清理資料
→ 刪除 Plugin Files

可能清理：

Options
Transients
Custom Tables
Custom Roles
Scheduled Events
Plugin-created Files
Personal Data

⚠️ Plugin 應該區分：

Deactivate：暫時關閉
Uninstall：永久移除
Delete data：是否真的刪除資料，最好讓使用者選擇
5｜除了 Frontend Request，還有其他 Runtime 分支
Runtime	入口／重要事件
Frontend	init → Query → Template → Response
Admin	admin_init → admin_menu → Admin Screen
REST API	rest_api_init → Authentication → Permission → Callback
AJAX	wp_ajax_{action} / wp_ajax_nopriv_{action}
Cron	WP-Cron → Scheduled Hook → Callback
WP-CLI	CLI Bootstrap → Command Callback
Login	Authentication Filters → Login Actions
Upload	Upload Validation → Media Processing
Block Editor	REST API＋Block Registration＋JavaScript
Webhook	REST Route 或 Action → Queue/HTTP API

這一點很重要：

Plugin 不是只有一條執行流程，而是掛在多種 WordPress Runtime Context 上。

Plugin 必須先判斷目前 Context，才載入所需模組，例如：

Plugin Bootstrap
├── 所有請求都需要 → Core Services
├── is_admin() → Admin Module
├── REST_REQUEST → REST Module
├── wp_doing_ajax() → AJAX Module
├── wp_doing_cron() → Cron Module
└── WP_CLI → CLI Module
最重要的總結

完整的 WordPress Plugin 系統其實由四件事組成：

核心問題	WordPress 的答案
Plugin 如何被找到？	Directory＋Plugin Header
Plugin 如何被啟用？	Active Plugin Registry
Plugin 如何加入系統？	同一 PHP Runtime＋Registration APIs
Plugin 如何改變行為？	Actions＋Filters＋Priority
Plugin 如何保存資料？	Options、Meta、CPT、Custom Tables
Plugin 如何提供功能？	Admin、Frontend、REST、Block、CLI、Cron
Plugin 如何升級？	Package Update＋Schema Migration
Plugin 如何離開？	Deactivate＋Uninstall

你可以先把它記成這條主線：

Discover
→ Install
→ Activate
→ Load
→ Register
→ Listen
→ Execute
→ Persist
→ Update
→ Deactivate
→ Uninstall