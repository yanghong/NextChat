import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import Locale from "../locales";
import BotIcon from "../icons/bot.svg";
import { getClientConfig } from "../config/client";
import LeftIcon from "@/app/icons/left.svg";
import EyeIcon from "../icons/eye.svg";
import EyeOffIcon from "../icons/eye-off.svg";
import clsx from "clsx";
import { login, register } from "../client/user";
import { showToast } from "./ui-lib";
import { useChatStore } from "../store";

export function AuthPage() {
  const navigate = useNavigate();
  const chatStore = useChatStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const goChat = () => navigate(Path.Chat);

  const submit = async () => {
    if (loading) return;

    try {
      setLoading(true);
      if (mode === "register") {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      await chatStore.loadRemoteSessions();
      goChat();
    } catch (error: any) {
      showToast(error?.message || "认证失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getClientConfig()?.isApp) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles["auth-page"]}>
      <div className={styles["auth-header"]}>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.Auth.Return}
          onClick={() => navigate(Path.Home)}
        ></IconButton>
      </div>
      <div className={styles["auth-shell"]}>
        <div className={clsx("no-dark", styles["auth-logo"])}>
          <BotIcon />
        </div>

        <div className={styles["auth-title"]}>
          {mode === "login" ? "登录账号" : "创建账号"}
        </div>
        <div className={styles["auth-tips"]}>
          {mode === "login"
            ? "继续使用你的私有会话空间"
            : "注册后聊天会话会按账号保存和隔离"}
        </div>

        <div className={styles["auth-tabs"]}>
          <button
            className={clsx({ [styles["active"]]: mode === "login" })}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            className={clsx({ [styles["active"]]: mode === "register" })}
            onClick={() => setMode("register")}
          >
            注册
          </button>
        </div>

        <div className={styles["auth-form"]}>
          <label className={styles["auth-field"]}>
            <span>邮箱</span>
            <input
              className={styles["auth-text-input"]}
              value={email}
              type="email"
              placeholder="name@example.com"
              onChange={(e) => {
                setEmail(e.currentTarget.value);
              }}
            />
          </label>

          {mode === "register" ? (
            <label className={styles["auth-field"]}>
              <span>昵称</span>
              <input
                className={styles["auth-text-input"]}
                value={name}
                type="text"
                placeholder="可选"
                onChange={(e) => {
                  setName(e.currentTarget.value);
                }}
              />
            </label>
          ) : null}

          <label className={styles["auth-field"]}>
            <span>密码</span>
            <div className={styles["auth-password-box"]}>
              <input
                className={styles["auth-text-input"]}
                aria-label="密码"
                value={password}
                type={passwordVisible ? "text" : "password"}
                placeholder="至少 8 位"
                onChange={(e) => {
                  setPassword(e.currentTarget.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void submit();
                  }
                }}
              />
              <button
                type="button"
                aria-label={Locale.Settings.ShowPassword}
                onClick={() => setPasswordVisible(!passwordVisible)}
              >
                {passwordVisible ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            </div>
          </label>
        </div>

        <div className={styles["auth-actions"]}>
          <IconButton
            text={loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
            type="primary"
            onClick={submit}
            className={styles["auth-primary"]}
          />
          <button
            className={styles["auth-link"]}
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
            }}
          >
            {mode === "login" ? "没有账号，去注册" : "已有账号，去登录"}
          </button>
        </div>
      </div>
    </div>
  );
}
