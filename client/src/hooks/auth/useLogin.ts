import { useMutation } from "@tanstack/react-query";
import { login } from "../../services/auth.service";

export const useLogin = () => {
  return useMutation({
    mutationFn: login,

    onSuccess: (data) => {
      alert("Login Successful!");

      console.log(data);

   
    },

    onError: (error: any) => {
      alert(error?.response?.data?.message || "Login Failed");
    },
  });
};