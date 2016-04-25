# Neulinx Web Platform Data Engine REST API Reference

## 概述

当前版本的 [Neulinx Data Engine](https://github.com/neulinx/de) 底层采用 [arangodb](http://arangodb.com) 作为 Graph Database。Neulinx Data Engine REST API 采用arangodb提供的 [Foxx Microservice](https://www.arangodb.com/foxx/) 作为框架进行开发。DataEngine API 当前版本没有提供鉴权认证功能，默认 DataEngine 运行在内网环境中。后续会加入对 API 调用的鉴权管理，将会采用 Foxx 提供的 API KEY 和 Session 机制。

当前的版本的 Data Engine 主要实现两个功能：

1. 采用 Graph 方式组织访问数据。
2. 采用模板方式进行数据渲染。(当前版本支持Handlebars模板）。

## 通用部分

### URL模板

DE REST API 中 URL 模板如下：

`http://主机信息/_db/数据库名/*挂载路径/*API信息`

* 在默认安装的开发环境下，主机信息通常是: `localhost:8529`
* 默认数据库为: `_system`
* 其中`*挂载路径`也就是虚拟路径，安装*DataEngine Application*时的*mount path*。
* 在使用`_system`默认库的情况下，可以省略掉`/_db/_system`。

其中 API 信息部分又采用如下格式模板：

`/版本号/API大类/*调用信息`

对于当前版本的Graph大类 API，具体的 URL 模板为：

`/v1/g/stub/key/path?参数表`

* `v1` 是当前API版本号：1.0
* `g` 是当前API的分类：**Graph**
* `stub/key` 用于在 Graph 结构中定位一个**锚点**，从而把网状结构转化为树状结构。然后可以以此**锚点**为根，进行树状遍历，找到最后的叶节点。
  * stub = `_uuid`，key 的值为 nodes 中的 `uuid` 值。所有资源的全局唯一标示。
  * stub = `_key`, key 的值就是 nodes collection 中的 `_key` 值，在该 collection 中唯一。
  * stub = 外部 collection 的名称，`stub/key` 就是当前数据库中其他 collection 中某个 document 的 `_id`。DataEngine 通过 nodes 中的 `ref` 字段索引到其在 Graph 中的位置。当前仅支持本数据库内数据的反向索引。
* `path` 部分是以 Graph Edge Name 作为路径的寻址方式。比如：`/stub/key/trunk/branch/leaf`。
* 数据源参数`s`：具体取值如下：
  * `s=..`，当前操作是对path指向的Graph Edge数据，即DataEngine中的link数据。
  * `s=.`，当前操作的是graph中指向原始数据的node，而不是原始数据本身。
  * `s=source`，指定数据源名称，可以是某个collection，也可以是文件系统的某个文件。通常用于在指定数据源中创建新的数据。
  * `s=selection`，用于HTTP GET中选择性的获取数据而不是对象全部的数据。例如某个数据对象有大量的字段，我们只要求返回name, age, sex三个字段信息，参数为：`s=name,age,sex`。注意字段间用“,”分隔。
    * `s=*`，在s没有指定的默认情况，是不返回数据对象中以下划线'\_'开头的属性字段，只有显示设置`s=*`时，才会返回全部属性字段。
* 模板渲染参数`r`: `r=render`: 这个参数用于指定是否需要对数据进行渲染，具体描述见相关章节。
  
### HTTP Body数据格式

格式统一起见，DE REST API中body统一采用JSON数据格式，即HTTP `Content-Type: application/json`。API中需要body内容的HTTP Method有两个：POST和PUT。

arangodb foxx框架中主要采用 [joi](https://github.com/hapijs/joi/blob/master/README.md)做数据验证。当前版本开发中对body字段没有做太多验证，通常需要JSON格式。而POST模板数据进行后端渲染时，body字段是无差别按照字符串文本进行处理。


## HTTP GET: 获取数据

### Header格式

`GET /v1/g/:root/:key/*path?s=selection&r=render`

* `v1`: 版本号 version 1.0
* `g`：类别 Graph
* `:root`: Graph中绝对寻址某个节点用于以此为Root的相对位置寻址。
  * `_uuid`: 用资源的全局唯一ID定位root。对应Graph.nodes.uuid值。
  * `_key`: 用Graph.nodes中的唯一标示`_key`寻址。
  * `collectionName`: 用原始数据寻址，`:root/:key`就是原始数据的`document-handle`
* `:key`: 参考`:root`说明，此参数对应不同`:root`参数，有不同的取值。
* `*path`: 使用link name进行寻址。`*path`代表后面是一个层次序列，例如：`branch1/branch2/leaf`。
  * 特殊取值“.”：当前节点只有一个out link时，可以不用指定名字，比如：`qrcode/./model`。需要注意的是，如果有多个*out link*时，`.`等同于`any`，是第一个找到的*out link*。`.`可以进行重复盲查，比如：`log/first/./././error`，可以用于单线列表式的数据结构快速寻址。
  * 特殊取值“..”：当前节点的后向寻址，而不是简单的回退到上一级节点。比如：`父亲/儿子/../母亲`，`儿子`节点有两个*in link*，`父亲`和`母亲`，`..`操作就是寻找*link name*为`母亲`的*in link*。`..`也可以级联进行寻址：`张三/儿子/../../张家`，但是这种级联不是简单回溯，而是等同于`张三/儿子/.././../张家`，是对`儿子`后向寻址任意一个*in link*（可能是`父亲`也可能是`母亲`），然后再从*父母*后向寻址到`张家`。
* `s=selection`: 这个参数用于指定GET想要返回的内容。
  * `s`参数不存在或者为空时: 完整获取数据对象，但是不返回以'_'开头的内部数据字段。这是默认的情况。
  * `s=.`: 获取当前的节点数据，而不是所指向的原始数据。
  * `s=..`: 获取前序节点与当前节点的Link数据。
  * `s=选取的属性列表`：选择性的获取数据而不是对象全部的数据。例如某个数据对象有大量的字段，我们只要求返回name, age, sex三个字段信息，参数为：`s=name,age,sex`。注意字段间用“,”分隔。
    * `s=*`，在s没有指定的默认情况，是不返回数据对象中以下划线'\_'开头的属性字段，只有显示设置`s=*`时，才会返回全部属性字段。
* `r=render`: 这个参数用于指定是否需要对数据进行渲染。
  * `r`参数存在，但没有赋值。这是默认情况，从当前数据对象中获取`_template`字段作为模板进行渲染，然后以`_contentType`作为渲染后返回的内容类型。
  * `r=path`, 指定对象作为模板进行渲染。Path有如下三种形式：
    * 绝对路径寻址：`/:root/:key/*path`
      * 当root值为`_uuid`时，采用Graph中唯一定义的UUID寻址；
      * 当root值为`_key`时，采用Vertex Key寻址；
      * 当root值为`_file`时，采用文件系统树状结构寻址。
      * 其他情况下，采用arangodb的`document handle`方式寻址，即`collection/key`方式寻址。前两种方式是在同一个Graph中的寻址，这一种是在整个数据库中的自由寻址。
    * 相对路径寻址：
      * 以根节点为相对位置的寻址方式：*Path =* `a/b/c`: 以当前*URL*的`:root/:key`为起点的相对路径寻址，等效于`/:root/:key/a/b/c`；
      * 以当前节点为相对位置的寻址方式：*Path =* `./a/b/c`: 以当前节点的`:root/:key/*path`为起点的相对路径寻址，等效于`/:root/:key/*path/a/b/c`。
      * 以当前节点为相对位置反向寻址：*Path =* `../x/y`，如果此时URL`/:root/:key/a/b?r=../x/y`，则是等效于后向寻找以x为名称指向b的节点的下一级y节点。
    * 文件系统寻址：当前仅支持以内部虚拟目录为根的绝对路径寻址，采用URI格式：`file:///a/b/c`。安全起见，文件路径禁止'/..'这种后向寻址方式。文件名以".."开头也不行。

* 特殊格式：当`*path`部分不存在时，表示采用绝对寻址方式直接对节点操作。与上述带有`*path`格式情况对比，不需要相对`path`寻址，不支持`s=..`获取Link数据的参数，其他都一样。

### 返回值

* 200：找到指定的数据并返回。
    * 请求完整原始数据时，均采用JSON格式。为了方便模板中数据定位，所有返回的数据对象都会包含一个隐藏属性`_gid`，作为该数据对象在Graph中的节点标示。
    * 选择性返回数据：`s=_key,name`
        * `{"_gid":"412356236","_key":"gary","name":"Gary"}`
    * 请求的节点指向为文件时，返回如下格式（其中data字段为文件中读取的内容）：
        * `{"_gid":"987987987692", "data":"文件内容"}`
    * 请求节点数据时，返回例示（不包含`_gid`）:  
        * `{"_id":handler,"_key":key,"ref":source_id,"type":type,"data":data}`
    * 请求连接数据时，返回结果实例：
        * ```
        {
          "_id":"work_de_links/195801828559",
          "_key":"195801828559",
          "_rev":"195801828559",
          "_from":"work_de_nodes/root",
          "_to":"work_de_nodes/195801631951",
          "name":"alice"
        }
    ```
* 404: 在此API代码中，遇到任何异常返回相关错误。在开发模式下会返回错误的细节信息:
    * `{"error":"The route is not viable."}`
* 渲染后的数据按照指定或默认的 `Content-Type` 在Body中返回。

## HTTP POST: 创建数据或渲染

### Header格式
`POST /v1/g/:root/:key/*path/leaf?s=source&r=content_type`

* `v1`: 版本号 version 1.0
* `g`：类别 Graph
* `:root`: Graph中绝对寻址某个节点用于以此为Root的相对位置寻址。
  * `_uuid`: 用资源的全局唯一ID定位root。对应Graph.nodes.uuid值。
  * `_key`: 用Graph.nodes中的唯一标示`_key`寻址。
  * `collectionName`: 用原始数据寻址，`:root/:key`就是原始数据的`document-handle`
* `:key`: 参考`:root`说明，此参数对应不同`:root`参数，有不同的取值。
* `*path`: 使用link name进行寻址。`*path`代表后面是一个层次序列，例如：`branch1/branch2/branch3`。
* `leaf`: 待新建的叶节点**Link**名称。
* `s=source`: 这个参数用于指定所创建数据对象的类型或位置。
  * `s`参数不存在或者为空时: 这是默认的情况，与下述`s=_solo`等效。
  * `s=_solo`: 直接在node中存放数据。创建`type=solo`的node，并把body中的内容进行解析，存放在`data`属性中。不能解析为JSON对象的，以纯文本方式存放。然后创建以**`leaf`**为名字的**Link**，从**`*path`**指向的节点连接新建的节点。
  * `s=file:///path`: 数据源指向虚拟目录系统中path指向的文件。目前不支持带host的uri，默认本地路径。当数据引擎处于开发模式下，可以对文件系统进行修改，以POST body为内容创建新的文件。在生产模式下，对文件系统的修改会报错。  
  * `s=.`: 使用**body**数据创建新的**node**，同时创建以**`leaf`**为名字的**Link**，从**`*path`**指向的节点连接新建的节点。注：此参数不创建外部数据，但可以创建**`type="_solo"`**的内部数据：**`data=内部数据`**。
  * `s=..`: 创建以当前**`*path`**为起始节点、以**body**参数中指向的节点为终结点、以**leaf**为名称的链接。这种情况下只会创建链接，而不会创建节点和原始数据。
  * `s=collection`：这种情况下会使用**body**中的数据，在外部**collection**中创建数据对象，同时创建一个指向该新建数据对象的**node**，并创建一个从**`*path`**节点指向新的**node**的名称为**leaf**的链接。
* `r=content_type`: 对Body中的内容进行渲染，并按照指定的格式返回。
  * r没有赋值时，采用默认的“Content-Type”返回数据，默认"text/html"。
* 特殊格式：下面的操作直接针对DataEngine底层数据操作，通常不推荐。执行时会严格检查数据对象是否与Links、Nodes的定义一致。
  * **“`POST /v1/g/._`”**：使用**body**数据直接创建新的节点。新节点可以在内部存放数据，也可以指向外部数据。本操作不会创建Link和外部数据。
  * **“`POST /v1/g/.._`”**：使用**body**数据直接创建新的链接，创建过程不产生新的节点和外部数据。

### Body数据格式

* 外部数据对象：当前版本仅支持同一个数据库的其他`collection`中的`document`。或者指定配置的"data"目录中创建文件。需要注意的是，文件系统修改操作只能在开发模式下，且文件不会进行同步复制和分片。**body**采用application/json数据格式。其中作为该数据对象键值的`_key`可以自行定义，也可以由系统自动产生。只是`_key`的定义要符合**arangodb**的命名规则。
* **node**数据对象：采用**DataEngine**定义的数据结构，如下所示。
  * ` {"_key": Key, "ref": Ref, "type": Type, "uuid": UUID, "data": Data}`
    * type = "_solo": node自身的data属性中直接存放数据。
    * type = "_file": ref中存放指向本地文件系统中的文件路径。
    * type = "_local"或者type未设置：ref中存放本数据库的document handle，即`collection/key`格式。
* **link**数据对象：这个数据对象不采用**link**内部的数据结构，而是采用`{type: Key}`格式，具体有如下几种形式：
  * `{"_uuid": UUID}`: 被连接节点的UUID值。
  * `{"_key": Key}`: 被连接节点的**document key**。
  * `{"_file": Path}`: 被连接节点是指向本地文件。
  * `{"_ref": "Collection/Key"}`: 被连接节点的外部引用数据对象的**document-handle**。
  * `{"_path": Path}`: 被连接节点可以是当前Graph的绝对路径或者相对路径。
    * *Path =* `/:root/:key/*path`: 绝对路径寻址，与上述 *URL* 路径寻址说明相同。
    * *Path =* `a/b/c`: 以当前*URL*的`:root/:key`为起点的相对路径寻址，等效于`/:root/:key/a/b/c`
    * *Path =* `./a/b/c`: 以当前节点的`:root/:key/*path`为起点的相对路径寻址，等效于`/:root/:key/*path/a/b/c`      
* 特殊格式**“`POST /v1/g/.._`”**下**link**数据对象则采用内部数据结构，即：
  * `{"_key": Key, "_from": From, "_to": To, "name": Name}`
* 特殊格式**“`POST /v1/g/._`”**下独立**节点**数据对象则采用内部数据结构，即上述**node**数据对象格式。

### 返回值

* 200：正确创建数据对象，并返回摘要信息。如：
    * `{"_id":"work_de_links/202120627671","_rev":"202120627671","_key":"202120627671"}`
* 200：r值指定的情况下，根据body内容正确渲染数据，并根据r值指定的类型返回渲染后的文件。
* 404: 在此API代码中，遇到任何异常返回相关错误。在开发模式下会返回错误的细节信息:
    * `{"error":"The route is not viable."}`

## HTTP PUT: 更改数据

### Header格式
`PUT /v1/g/:root/:key/*path?s=source`

* `v1`: 版本号 version 1.0
* `g`：类别 Graph
* `:root`: Graph中绝对寻址某个节点用于以此为Root的相对位置寻址。
  * `_uuid`: 用资源的全局唯一ID定位root。对应Graph.nodes.uuid值。
  * `_key`: 用Graph.nodes中的唯一标示`_key`寻址。
  * `collectionName`: 用原始数据寻址，`:root/:key`就是原始数据的`document-handle`
* `:key`: 参考`:root`说明，此参数对应不同`:root`参数，有不同的取值。
* `*path`: 使用link name进行寻址。`*path`代表后面是一个层次序列，例如：`branch1/branch2/branch3`。
* `s=source`: 这个参数用于指定所创建数据对象的类型或位置。
  * `s=.`: 使用**body**数据更新当前`*path`指向的**node**数据。此操作仅改变**node**内部数据，不会更改外部的原始数据和链接数据。
  * `s=..`: 使用**body**中的数据更新当前`*path`末端的**link**数据。需要注意的是，由于**link**内部数据中只有`name`字段能够被修改，也就是说只有`{"name": newName}`才真正起作用。
  * `s`未设置或者为空：这是默认情况，使用**body**中的数据更新原始数据。**body**中的数据会更新原始数据已有字段、增加原始数据中没有的字段。注：在**node**内部**data**字段保存的数据可以是任意形式。注：数据源为文件时，统一以普通文本格式覆盖原来的文件，而不会按对象进行更新操作。
* 特殊格式：当`*path`部分不存在时，表示采用绝对寻址方式直接对节点操作。与上述带有`*path`格式情况对比，不需要相对`path`寻址，不支持`s=..`操作Link数据的参数，其他都一样。即当`s=.`时更新**Graph Node**数据；当`s`不存在时，更新原始数据。

### Body数据格式

* 外部数据对象：当前版本仅支持同一个数据库的其他`collection`中的`document`。**body**采用application/json数据格式。其中作为该数据对象键值的`_key`可以自行定义，也可以由系统自动产生。只是`_key`的定义要符合**arangodb**的命名规则。当外部数据是文件时，直接执行覆盖操作，不再进行对象解析。
* 内部数据对象：直接在`node.data`中存放数据时，**body**可以为任意格式，只不过当`node.data`和`body`数据都是**object**类型时，执行`union update`操作；是其他类型数据时，直接执行覆盖替换操作。
* **node**数据对象：采用**DataEngine**定义的数据结构，如下所示。不过由于系统限制，`_key`是无法被修改的。
    * ` {"_key": Key, "ref": Ref, "type": Type, "uuid": UUID, "data": Data}`
* **link**数据对象：这个数据对象采用**link**内部的数据结构，但是由于系统限制，整个**link**内部数据中，只有`name`是可以被更改的。因此有效的数据格式是`{"name": newName}`。当然，link中是可以携带其他字段内容，当前版本不建议这样做。
    
### 返回值

* 200：正确更新数据对象或者文件，并返回摘要信息。如下所示。其中`_rev`与`_oldRev`是更新前后的**revision**号。
    * `{"_id":"male/jerry","_rev":"214392413514","_oldRev":"202177512919","_key":"jerry"}`
    
* 404: 在此API代码中，遇到任何异常返回相应的错误，如:
    * `{"error":"The route is not viable."}`

## HTTP DELETE: 删除数据

### Header格式
`DELETE /v1/g/:root/:key/*path?s=source`

* `v1`: 版本号 version 1.0
* `g`：类别 Graph
* `:root`: Graph中绝对寻址某个节点用于以此为Root的相对位置寻址。
  * `_uuid`: 用资源的全局唯一ID定位root。对应Graph.nodes.uuid值。
  * `_key`: 用Graph.nodes中的唯一标示`_key`寻址。
  * `collectionName`: 用原始数据寻址，`:root/:key`就是原始数据的`document-handle`
* `:key`: 参考`:root`说明，此参数对应不同`:root`参数，有不同的取值。
* `*path`: 使用link name进行寻址。`*path`代表后面是一个层次序列，例如：`branch1/branch2/branch3`。
* `s=source`: 这个参数用于指定所创建数据对象的类型或位置。
  * `s=..`: 仅仅删除当前**`*path`**最后的叶节点与前序节点间的链接。
  * `s=.`: 删除当前**`*path`**指向的节点，同时自动删除与该节点相连的所有链接。此操作不影响外部原始数据，但是会同时删除内部数据。
  * `s`未设置或者为空：这是默认情况，首先会删除**`*path`**指向的节点及该节点关联的所有链接，然后如果该**node**指向外部数据，则会同时删除外部数据对象。如果数据节点指向为文件时，开发模式下目标文件也会被删除；但在生产模式下，删除操作会报错，只能采用`s=.`先删除节点。
* 特殊格式：当`*path`部分不存在时，表示采用绝对寻址方式直接对节点操作。与上述带有`*path`格式情况对比，不需要相对`path`寻址，不支持`s=..`删除Link数据的参数，其他都一样。即当`s=.`时删除**Graph Node**及相关链接；当`s`不存在或者为空时，同时还会删除原始数据。

### 返回值

* 200：成功删除数据对象后，返回
    * `{"success": true}`
    
* 404: 在此API代码中，遇到任何异常统一返回如下错误:
    * `{"error":"The route is not viable."}`

## 数据渲染
当前版本的数据引擎支持基于 [Handlebars](http://handlebarsjs.com)模板的数据渲染，并在其中扩展了一个名为`locate`的块指令。

数据渲染有两种方式，一种是后端模板渲染模式，通过指定数据节点和后端保存的模板进行组合渲染。具体是通过HTTP GET命令发起，PATH部分是喂入模板中的数据节点，参数部分的'r=template'指定模板位置。模板可以存储在服务器数据目录的文件中，也可以存放在内部节点中或者外部数据对象中。以数据对象存储时，默认模板存放在`_template`属性中，而返回模板的内容类型（content-type）则默认存放在`_contentType`属性中；`_contentType`属性不提供时，使用默认类型："text/html"；以文件方式存储时，直接读取文件原始内容作为模板，渲染后采用默认的"text/html"返回。

另一种渲染方式是前端模板渲染方式。即通过HTTP POST命令推送上传模板给后端，后端对其进行渲染后返回。返回时采用的"content-type"由URL中的r参数指定。r参数没有赋值时，采用默认的"text/html"类型。

需要注意的是，模板内的相对根路径是HTTP请求的URL的叶节点位置，而URL中的相对根路径是/:root/:key。比如，URL为`/_key/root/a/b/c?r=a/x/y`时，r参数中`x/y`的实际路径为：`/_key/root/x/y`；`/_key/root/x/y`存储的模板中的字符串`{{x/y}}`的实际路径为：`/_key/root/a/b/c/x/y`，模板中`{{x/y}}`等效`{{./x/y}}`。

### 模板格式
模板中的格式参考Handlebars文档，可以按照Handlebars定义的格式以当前数据节点为context进行数据访问操作。同时数据引擎扩展了一个`locate`命令，该命令的参数为上述`path`格式的路径信息，进行绝对寻址或者相对寻址。例如，假定数据引擎中存储这样一个Graph：/_key/root/a/b/c/d, 假定每一节点中包含一个代表名称的name字段，其中d节点中包含一个模板`_template`字段，其内容如下。

```
<html>
  <head>
    <title> 这里是节点a的name：{{name}}，在此模板中，a节点成为根节点</title>
  </head>
  <body>
    <p>第一层，context是a，显示a的名称: {{name}}</p>
    <p>使用 locate 命令进入第二层：{{#locate "b"}} 这里的context是b，显示节点b的名称：{{name}}, locate的参数“b”是从锚点a开始的相对路径寻址，此处等同于"./b"。{{/locate}}</p>
    <p>两级路径进入第三层：{{#locate "b/c"}}这里的context是c，显示c的名称：{{name}}。{{/locate}}</p>
    <p>采用嵌套方式：
      {{#locate "b"}}这里是节点b的名称：{{name}}。
        {{#locate "./c"}}这里是c的名称：{{name}}。需要注意的是，这里"./c"参数跟"c"不同，前者路径为：`/root/a/b/c`, 后者的路径为`/root/a/c`。{{/locate}}
      {{/locate}}
    </p>
    <p>直接访问root名称：{{locate "/_key/root" "name"}}, 直接访问d的名称：{{locate "./b/c/d", "name"}}</p>
  </body>
</html>
```

采用 `GET /v1/g/_key/root/a?r=./b/c/d` 获取渲染后的数据（r值等效于：`r=a/b/c/d`, 或者 `r=/_key/root/a/b/c/d`）：

```
<html>
  <head>
    <title> 这里是节点a的name：a_name，在此模板中，a节点成为根节点</title>
  </head>
  <body>
    <p>第一层，context是a，显示a的名称: a_name</p>
    <p>使用 locate 命令进入第二层： 这里的context是b，显示节点b的名称：b_name, locate的参数“b”是从锚点a开始的相对路径寻址，此处等同于"./b"。</p>
    <p>两级路径进入第三层：这里的context是c，显示c的名称：c_name。</p>
    <p>采用嵌套方式：这里是节点b的名称：b_name。这里是c的名称：c_name。需要注意的是，这里"./c"参数跟"c"不同，前者路径为：`/root/a/b/c`, 后者的路径为`/root/a/c`。</p>
    <p>直接访问root名称：root_name, 直接访问d的名称：d_name</p>
  </body>
</html>
```

### 后端模板渲染

用于数据渲染的模板要求存储在同数据库中任意可被访问位置的document中。当前版本要求该document至少包含一个`_template`字段存储模板，还可以包含一个`_contentType`的字段指定渲染后数据的内容格式，用于HTTP 'content-type'字段。

参考上述HTTP GET中render参数的描述。GET获取数据时，可以在指定模板上进行数据渲染，该数据模板的context数据即为GET所指向的资源节点。当`r`参数没有赋值时，默认当前数据对象中包含模板相关数据字段。`r`参数可以携带模板存储路径信息，具体格式参考HTTP GET相关描述。

### 前端模板渲染
前端WEB应用也可以把复杂的数据访问以模板方式推送到后端，由后端进行渲染后一次性返回所有的数据访问结果。这个数据推送操作采用HTTP POST方式，详见前面的内容。以 curl 举例：

`curl -d "root的名字：{{name}}, c的名字：{{locate "a/b/c" "name"}}" http://host:port/mount/v1/g/_key/root?r`

返回：
`root的名字：root_name, c的名字：c_name`

## 参数配置

DataEngine作为Foxx模块，采用manifest.json文件作为配置文件，具体配置项参考foxx文档。需要特别指出的是manifest.json的"files"配置项，这里面需要配置数据文件的路径，比如指定"assets/tpl"子目录作为数据文件位置，则需要在manifest中配置: `"files": {"data": "assets/tpl"}`。如果没有配置`files`中的`data`，则默认使用"data"子目录作为数据文件虚拟目录。
