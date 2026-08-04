import { createApp, h, reactive, shallowReactive } from "../../node_modules/vue/dist/vue.runtime.esm-browser.prod.js";
import { render } from "./vue-render.generated.js";

const root = document.querySelector("#app");
root.replaceChildren();

const savedTheme = ["system", "light", "dark"].includes(localStorage.getItem("share-master-theme"))
  ? localStorage.getItem("share-master-theme")
  : "system";
const resolvedTheme = savedTheme === "system"
  ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  : savedTheme;
document.documentElement.dataset.theme = resolvedTheme;
document.documentElement.style.colorScheme = resolvedTheme;
window.codexDeck.setWindowTheme(resolvedTheme);

const attachmentUi = reactive({
  items: [],
  dragActive: false,
});
window.ShareMasterVueRuntime = { shallowReactive, attachmentUi };

const AttachmentTray = {
  name: "AttachmentTray",
  setup() {
    const remove = (index) => window.dispatchEvent(new CustomEvent("share-master:remove-attachment", {
      detail: { index },
    }));
    const copy = (item) => window.dispatchEvent(new CustomEvent("share-master:copy-attachment", {
      detail: { path: item.path },
    }));
    return () => h("div", {
      id: "attachment-list",
      class: ["attachment-list", { hidden: attachmentUi.items.length === 0 }],
      "aria-label": "待发送图片附件",
    }, attachmentUi.items.map((item, index) => h("div", {
      class: "attachment-item",
      key: item.path,
    }, [
      h("img", { src: item.url, alt: `待发送图片 ${index + 1}` }),
      h("span", { class: "attachment-copy" }, [
        h("strong", { title: item.name }, item.name),
        h("small", null, "图片附件"),
      ]),
      h("button", {
        type: "button",
        class: "attachment-copy-button",
        title: `复制 ${item.name}`,
        "aria-label": `复制 ${item.name}`,
        onClick: () => copy(item),
      }, [h("span", { "aria-hidden": "true" }, "⧉")]),
      h("button", {
        type: "button",
        class: "attachment-remove",
        title: `移除 ${item.name}`,
        "aria-label": `移除 ${item.name}`,
        onClick: () => remove(index),
      }, [h("span", { "aria-hidden": "true" }, "×")]),
    ])));
  },
};

const AttachmentDropOverlay = {
  name: "AttachmentDropOverlay",
  setup() {
    return () => h("div", {
      id: "attachment-drop-overlay",
      class: ["attachment-drop-overlay", { hidden: !attachmentUi.dragActive }],
      role: "status",
      "aria-live": "polite",
    }, [
      h("div", { class: "attachment-drop-content" }, [
        h("span", { class: "attachment-drop-symbol", "aria-hidden": "true" }, "+"),
        h("strong", null, "释放以添加图片"),
        h("small", null, "PNG、JPG、WebP 或 GIF，最多 8 张"),
      ]),
    ]);
  },
};

const vueApp = createApp({
  name: "ShareMasterApp",
  components: { AttachmentTray, AttachmentDropOverlay },
  render,
  async mounted() {
    try {
      await new Promise((resolve, reject) => {
        const controller = document.createElement("script");
        controller.src = "app.js";
        controller.addEventListener("load", resolve, { once: true });
        controller.addEventListener("error", () => reject(new Error("无法加载 Share Master 业务控制器。")), { once: true });
        document.body.appendChild(controller);
      });
      root.classList.remove("vue-pending");
      root.classList.add("vue-ready");
    } catch (error) {
      root.classList.remove("vue-pending");
      root.innerHTML = `<main class="renderer-fatal" role="alert"><strong>Share Master 界面初始化失败</strong><span></span></main>`;
      root.querySelector("span").textContent = error?.message || String(error);
      console.error(error);
    }
  },
});

vueApp.config.errorHandler = (error) => {
  console.error("[vue]", error);
};
vueApp.mount(root);
window.shareMasterVue = vueApp;
