import axios from "axios";
import { logout } from "../../redux/slices/auth.slice";
import { getDispatch } from "@/services/store.service";
import config from "@/infra/activeconfig";

const authAxiosInstance = axios.create({
  baseURL: config.BASE_URLS.AUTH,
  withCredentials: true,
});

authAxiosInstance.interceptors.request.use(
  (config) => {
    const reduxInfo = localStorage.getItem("persist:auth") || "{}";
    const parsedUser = JSON.parse(JSON.parse(reduxInfo).user);
    return config;
  },
  (error) => Promise.reject(error)
);

let sessionExpiredHandled: boolean = false;

authAxiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.message?.toLowerCase();

    if (status === 403 && message?.includes("expired") && !sessionExpiredHandled) {
      sessionExpiredHandled = true;
      console.log('session expired again');
      getDispatch()(logout());
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export default authAxiosInstance;