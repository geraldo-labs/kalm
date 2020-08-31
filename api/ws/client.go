package ws

import (
	"encoding/json"
	"github.com/go-logr/logr"
	"github.com/gorilla/websocket"
	"github.com/kalmhq/kalm/api/client"
	"github.com/kalmhq/kalm/api/log"
	rbac2 "github.com/kalmhq/kalm/api/rbac"
	"github.com/kalmhq/kalm/api/resources"
)

type ReqMessage struct {
	Method string `json:"method"`
	Token  string `json:"token"`
}

type ResMessage struct {
	Namespace string      `json:"namespace"`
	Kind      string      `json:"kind"`
	Action    string      `json:"action"` // Add Delete Update
	Data      interface{} `json:"data"`
}

type Client struct {
	clientPool *ClientPool

	conn *websocket.Conn

	Send chan []byte

	Done chan struct{}

	StopWatcher chan struct{}

	K8sClientManager client.ClientManager

	RBACEnforcer rbac2.Enforcer

	ClientInfo *client.ClientInfo

	logger     logr.Logger
	IsWatching bool
}

type ClientPool struct {
	clients map[*Client]bool

	register chan *Client

	unregister chan *Client
}

func NewClientPool() *ClientPool {
	return &ClientPool{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *ClientPool) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Send = nil
			}
		}
	}
}

func (c *Client) read() {
	defer func() {
		c.clientPool.unregister <- c
		close(c.StopWatcher)
		close(c.Done)
		c.conn.Close()
	}()

	for {
		_, messageBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure, websocket.CloseNoStatusReceived) {
				return
			}

			log.Error(err, "read message error")
			return
		}

		var reqMessage ReqMessage
		_ = json.Unmarshal(messageBytes, &reqMessage)

		if c.ClientInfo == nil {
			clientInfo, err := c.K8sClientManager.GetClientInfoFromToken(reqMessage.Token)

			if err != nil {
				log.Error(err, "new config error")
			}

			c.ClientInfo = clientInfo
		}

		if reqMessage.Method == "StartWatching" && !c.IsWatching {
			c.IsWatching = true
			c.sendWatchResMessage(&ResMessage{Kind: "PlainMessage", Data: "Started"})
			go StartWatching(c)
		}

	}
}
func (c *Client) Builder() *resources.Builder {
	return resources.NewBuilder(c.ClientInfo, c.logger, c.RBACEnforcer)
}

func (c *Client) write() {
	defer func() {
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				break
			}

			err := c.conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Error(err, "write message error")
				break
			}
			continue
		case <-c.Done:
			return
		}
	}
}

func (c *Client) sendWatchResMessage(resMessage *ResMessage) {
	if resMessage.Action == "" {
		return
	}

	bts, err := json.Marshal(resMessage)
	if err != nil {
		log.Error(err, "parse message error")
		return
	}

	c.Send <- bts
}
