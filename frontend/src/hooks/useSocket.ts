import { useEffect, useState } from "react"

const WS_URL="chessbackend-git-main-deepak-kumar-majhis-projects.vercel.app";


export const useSocket = () => {
  const [socket,setSocket]=useState<WebSocket | null >(null)

  useEffect(()=>{
   const ws=new WebSocket(WS_URL);

   ws.onopen=()=>{
    setSocket(ws);
   }

   ws.onclose=()=>{
    setSocket(null);
   }

   return ()=>{
    ws.close();
   }
  },[])
  return socket;
}