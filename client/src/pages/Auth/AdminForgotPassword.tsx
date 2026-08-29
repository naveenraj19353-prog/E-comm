import ForgotPasswordPage from "./ForgotPasswordPage";

export default function AdminForgotPassword() {
    return (
        <ForgotPasswordPage
            mode="admin"
            loginPath="/admin/login"
        />
    );
}
