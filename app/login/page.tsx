import type { Metadata } from 'next';
import LoginForm from './LoginForm';
import styles from './login.module.css';

export const metadata: Metadata = {
  title: '登录',
  description: '用邮箱验证码登录 Yilin 工具箱。',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="shell">
      <div className={styles.page}>
        <LoginForm />
      </div>
    </div>
  );
}
