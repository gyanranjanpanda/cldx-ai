import api from "../utils/axios";


export const sendPrompt =async(payload)=>{

 const { data } =await api.post( "/api/agent/chat",payload);
console.log(data)
 return data;

};

export const startArtifactPreview = async (artifact) => {
 const { data } = await api.post(
  "/api/agent/preview/start",
  { artifact }
 );

 return data.session;
};

export const getArtifactPreviewStatus = async (sessionId) => {
 const { data } = await api.get(
  `/api/agent/preview/${sessionId}/status`
 );

 return data.session;
};

export const stopArtifactPreview = async (sessionId) => {
 const { data } = await api.delete(
  `/api/agent/preview/${sessionId}`
 );

 return data.session;
};

export const getArtifactPreviewUrl = (previewPath = "") => {
 if (!previewPath) return "";

 return new URL(
  `/api/agent${previewPath}`,
  api.defaults.baseURL || window.location.origin
 ).href;
};

export const getArtifactPreviewEventsUrl = (sessionId = "") => {
 if (!sessionId) return "";

 return new URL(
  `/api/agent/preview/${sessionId}/events`,
  api.defaults.baseURL || window.location.origin
 ).href;
};
