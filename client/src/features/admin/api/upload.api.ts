import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type UploadFolder = "products" | "banners";

export type UploadImageResponse = {
    success: boolean;
    message: string;
    key: string;
    url: string;
};

export const uploadImageToS3 = async (
    file: File,
    tenantId: string,
    folder: UploadFolder = "products",
): Promise<UploadImageResponse> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<UploadImageResponse>(
        API_ENDPOINTS.UPLOAD.IMAGE,
        formData,
        {
            params: {
                tenantId,
                folder,
            },
            transformRequest: [
                (data, headers) => {
                    // Drop JSON default so the browser sets multipart boundary.
                    if (data instanceof FormData && headers) {
                        delete headers["Content-Type"];
                    }
                    return data;
                },
            ],
        },
    );

    if (!response.data?.key) {
        throw new Error("Upload succeeded but no S3 key was returned.");
    }

    return response.data;
};
